
// app/api/org/route.ts
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
import { withAuth } from "@/lib/withAuth"
import { canAccess } from "@/lib/rbac"
import { ORG_TYPES, allowedChildTypes, slugify, isFieldUnitType, isValidPlacement, departmentCanSpread } from "@/lib/orgStructure"
import { bumpTreeVersion } from "@/lib/redis"

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")

  const data = await prisma.orgUnit.findMany({
    where: {
      path: { startsWith: user.orgUnit.path }, // scope to caller's subtree
      ...(type ? { type: type as any } : {})
    },
    orderBy: { path: "asc" }
  })

  return NextResponse.json(data)
}

/**
 * POST — create one org unit.
 *
 * Gated by the `manage_org_units` grant rather than a bare role check, so a
 * SUPER_ADMIN can hand structure editing to a division administrator through
 * Accounts Management without also handing over user administration.
 *
 * The shape is validated against ORG_CHILD_TYPES: every consumer of the tree
 * (assignment tiers, political-area resolution, label builders) assumes that
 * chain, and an admin building a tier in the wrong place would silently break
 * reporting for everything beneath it.
 */
export const POST = withAuth(async (req, user) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const { name, type, parentId, code, placement } = body as any
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  const upperType = String(type ?? "").toUpperCase()
  if (!ORG_TYPES.includes(upperType as any)) {
    return NextResponse.json(
      { error: `Unknown org unit type "${type}". Expected one of: ${ORG_TYPES.join(", ")}` },
      { status: 400 }
    )
  }

  // Placement (corporate-only vs spreadable) is a department attribute —
  // reject it anywhere else so a stray client cannot park it on a zone.
  let placementValue: string | null = null
  if (placement !== undefined && placement !== null && placement !== "") {
    if (upperType !== "DEPARTMENT") {
      return NextResponse.json(
        { error: "placement only applies to departments." },
        { status: 400 }
      )
    }
    if (!isValidPlacement(placement)) {
      return NextResponse.json(
        { error: `placement must be one of: ${["CORPORATE_ONLY", "SPREADABLE"].join(", ")}.` },
        { status: 400 }
      )
    }
    placementValue = String(placement).toUpperCase()
  }

  const parent = parentId
    ? await prisma.orgUnit.findUnique({ where: { id: parentId } })
    : null

  if (parentId && !parent) {
    return NextResponse.json({ error: "Parent not found" }, { status: 404 })
  }

  // Verify parent is within caller's scope (exact-or-"/" so a sibling whose
  // path merely shares a prefix — "…/cwr" vs "…/cwr-section" — is not swept in).
  if (parent && !canAccess(user.orgUnit.path, parent.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Only a bare root may be a COUNTRY; deeper units follow the chain.
  if (!parent && upperType !== "COUNTRY") {
    return NextResponse.json(
      { error: "Only a country may be created without a parent" },
      { status: 400 }
    )
  }
  if (parent && !allowedChildTypes(parent.type).includes(upperType as any)) {
    return NextResponse.json(
      {
        error: `A ${parent.type} may not contain a ${upperType}. Allowed under ${parent.type}: ${
          allowedChildTypes(parent.type).join(", ") || "nothing (leaf)"
        }`,
      },
      { status: 400 }
    )
  }

  // Placement rule: a CORPORATE_ONLY department never grows the field arm.
  // Refuse the Zones/Regions CATEGORY folders under it (everything field-side
  // hangs off a category, so blocking here blocks the whole subtree).
  if (
    parent?.type === "DEPARTMENT" &&
    upperType === "CATEGORY" &&
    !departmentCanSpread((parent as any).placement)
  ) {
    return NextResponse.json(
      {
        error: `"${parent.name}" is corporate-only and cannot hold Zones/Regions folders. Edit the department's placement first.`,
      },
      { status: 400 }
    )
  }

  const cleanName = name.trim().replace(/\s+/g, " ")
  const slug = slugify(cleanName)
  const path = parent ? `${parent.path}/${slug}` : slug

  // `path` is unique and is the scope key everything else filters on, so a
  // duplicate slug is a real conflict — surface it instead of 500-ing on P2002.
  const clash = await prisma.orgUnit.findUnique({ where: { path } })
  if (clash) {
    return NextResponse.json(
      { error: `"${cleanName}" already exists${parent ? ` under ${parent.name}` : ""}. Choose a different name.` },
      { status: 409 }
    )
  }

  try {
    const org = await prisma.orgUnit.create({
      data: {
        name: cleanName,
        type: upperType as any,
        parentId: parent?.id ?? null,
        path,
        // Zones/regions keep their short code ("EAAZ") as the stable
        // political-area key, so renaming the display name later cannot orphan
        // the reporting that keys on it.
        code: code != null && code !== ""
          ? String(code).trim().toUpperCase()
          : (isFieldUnitType(upperType) ? cleanName : null),
        // Department placement (corporate-only vs spreadable). Null for every
        // other type — the API has already rejected a placement anywhere else.
        placement: placementValue,
      },
    })

    // Every /api/tree consumer holds a pre-edit tree until its TTL — bump the
    // version so the change is visible immediately (lib/redis.ts).
    await bumpTreeVersion()
    return NextResponse.json(org)
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: `"${cleanName}" already exists${parent ? ` under ${parent.name}` : ""}` },
        { status: 409 }
      )
    }
    throw err
  }
}, "manage_org_units")
