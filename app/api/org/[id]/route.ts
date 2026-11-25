// app/api/org/[id]/route.ts
//
// PATCH / DELETE for a single org unit — the write side of the org-structure
// editor (/dashboard/admin/org-structure). POST on /api/org creates; this file
// renames, relocates and removes.
//
// Both are gated by the `manage_org_units` grant (same as POST) and both are
// scoped: a caller may only touch units inside their own path.

import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/withAuth"
import { canAccess } from "@/lib/rbac"
import { allowedChildTypes, slugify, isValidPlacement } from "@/lib/orgStructure"
import { bumpTreeVersion } from "@/lib/redis"
import { createAuditLog } from "@/lib/audit"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Rewrite `path` for a unit and everything beneath it.
 *
 * `path` is both the scope key (`canAccess` and every `startsWith` filter) and
 * the parent-derived slug, so a unit that moves to a new parent must be
 * re-rooted or it would still resolve under its OLD branch — invisible to its
 * new parent's scope while still visible to its old one.
 *
 * `oldPath + "/"` (rather than bare `oldPath`) keeps a sibling such as
 * "…/cwr-section" out of a move on "…/cwr".
 */
async function rebaseSubtree(id: string, oldPath: string, newPath: string): Promise<number> {
  const descendants = await prisma.orgUnit.findMany({
    where: { path: { startsWith: `${oldPath}/` } },
    select: { id: true, path: true },
  })
  const self = await prisma.orgUnit.findUnique({ where: { id }, select: { path: true } })
  if (self?.path !== oldPath) {
    throw new Error("Org unit path changed concurrently — reload and retry")
  }

  await prisma.$transaction([
    prisma.orgUnit.update({ where: { id }, data: { path: newPath } }),
    ...descendants.map((d) =>
      prisma.orgUnit.update({
        where: { id: d.id },
        data: { path: newPath + d.path.slice(oldPath.length) },
      }),
    ),
  ])
  return 1 + descendants.length
}

/**
 * PATCH — rename, recode, or move a unit.
 *
 * A rename deliberately does NOT rewrite the path: `path` is opaque (never
 * rendered, only compared), the slug it was built from is historical, and
 * rewriting would cascade into every audit row and asset-event snapshot that
 * recorded it. A MOVE does rewrite, because there the path's prefix is load-
 * bearing — see rebaseSubtree above.
 */
export async function PATCH(req: NextRequest, context: Ctx) {
  return withAuth(async (_req, user) => {
    const { id } = await context.params

    const node = await prisma.orgUnit.findUnique({ where: { id } })
    if (!node) return NextResponse.json({ error: "Org unit not found" }, { status: 404 })
    if (!canAccess(user.orgUnit.path, node.path)) {
      return NextResponse.json({ error: "Org unit is outside your scope" }, { status: 403 })
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }

    const changes: { field: string; from: unknown; to: unknown }[] = []
    const data: Record<string, any> = {}

    if (body?.name !== undefined) {
      const cleanName = String(body.name).trim().replace(/\s+/g, " ")
      if (!cleanName) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
      if (cleanName !== node.name) {
        data.name = cleanName
        changes.push({ field: "name", from: node.name, to: cleanName })
      }
    }

    if (body?.code !== undefined) {
      const code = body.code === null || body.code === "" ? null : String(body.code).trim().toUpperCase()
      if (code !== node.code) {
        data.code = code
        changes.push({ field: "code", from: node.code, to: code })
      }
    }

    // Placement (corporate-only vs spreadable) — a department attribute. Only
    // DEPARTMENT rows carry it; flipping a spreadable department to
    // CORPORATE_ONLY keeps any existing Zones/Regions folders (the rule blocks
    // NEW field children, it never destroys structure), so this stays a plain
    // field edit like name/code.
    if (body?.placement !== undefined) {
      if (node.type !== "DEPARTMENT") {
        return NextResponse.json({ error: "placement only applies to departments." }, { status: 400 })
      }
      const placement = body.placement == null || body.placement === ""
        ? null
        : String(body.placement).toUpperCase()
      if (placement !== null && !isValidPlacement(placement)) {
        return NextResponse.json(
          { error: "placement must be CORPORATE_ONLY or SPREADABLE." },
          { status: 400 }
        )
      }
      if (placement !== node.placement) {
        data.placement = placement
        changes.push({ field: "placement", from: node.placement, to: placement })
      }
    }

    // Resolved parent (null ⇒ root). Only consulted when parentId is supplied.
    let newParent: { id: string; name: string; path: string; type: string } | null = null
    if (body?.parentId !== undefined) {
      newParent = body.parentId
        ? await prisma.orgUnit.findUnique({ where: { id: body.parentId } })
        : null

      if (body.parentId && !newParent) {
        return NextResponse.json({ error: "New parent not found" }, { status: 404 })
      }
      if (newParent) {
        if (!canAccess(user.orgUnit.path, newParent.path)) {
          return NextResponse.json({ error: "New parent is outside your scope" }, { status: 403 })
        }
        if (newParent.id === node.id) {
          return NextResponse.json({ error: "A unit cannot be its own parent" }, { status: 400 })
        }
        if (!allowedChildTypes(newParent.type).includes(node.type as any)) {
          return NextResponse.json(
            { error: `A ${newParent.type} may not contain a ${node.type}. Allowed: ${
              allowedChildTypes(newParent.type).join(", ") || "nothing (leaf)"
            }` },
            { status: 400 }
          )
        }
        if (node.type === "COUNTRY") {
          return NextResponse.json({ error: "A country cannot be moved" }, { status: 400 })
        }
      } else if (node.type !== "COUNTRY") {
        return NextResponse.json(
          { error: "Only a country may be moved to the root" },
          { status: 400 }
        )
      }

      if ((newParent?.id ?? null) !== node.parentId) {
        data.parentId = newParent?.id ?? null
        changes.push({ field: "parent", from: node.parentId, to: newParent?.id ?? null })
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, unchanged: true, node })
    }

    const oldPath = node.path
    let newPath = oldPath
    let rebased = 0

    // A move only actually relocates when the derived path changes — e.g. an
    // AREA moving between two sections whose slugs differ. Same parent, no
    // rename ⇒ nothing to re-root.
    if ("parentId" in data) {
      const nextPath = newParent
        ? `${newParent.path}/${slugify(data.name ?? node.name)}`
        : slugify(data.name ?? node.name)
      if (nextPath !== oldPath) {
        const clash = await prisma.orgUnit.findUnique({ where: { path: nextPath } })
        if (clash && clash.id !== node.id) {
          return NextResponse.json(
            { error: `"${data.name ?? node.name}" already exists under ${newParent?.name ?? "the root"}` },
            { status: 409 }
          )
        }
        newPath = nextPath
        data.path = nextPath
      }
    }

    try {
      if (newPath !== oldPath) {
        // Re-root first (self + descendants, one transaction), then apply the
        // field changes. rebaseSubtree asserts the path is still the one we
        // measured, so a concurrent edit fails loudly instead of mangling
        // two branches.
        rebased = await rebaseSubtree(node.id, oldPath, newPath)
        const rest = Object.fromEntries(Object.entries(data).filter(([k]) => k !== "path"))
        if (Object.keys(rest).length > 0) {
          await prisma.orgUnit.update({ where: { id: node.id }, data: rest })
        }
      } else {
        await prisma.orgUnit.update({ where: { id: node.id }, data })
      }
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: `A unit with that name already exists in the new location` },
          { status: 409 }
        )
      }
      throw err
    }

    // Every /api/tree consumer holds a pre-move tree until its TTL — bump the
    // version so the change is visible immediately (lib/redis.ts).
    await bumpTreeVersion()
    await createAuditLog({
      performedById: user.id,
      action: `Updated org unit "${node.name}" (${node.type})`,
      actionType: "ORG_STRUCTURE",
      metadata: { id: node.id, path: newPath, changes, rebased } as any,
    })

    const updated = await prisma.orgUnit.findUnique({ where: { id: node.id } })
    return NextResponse.json({ success: true, node: updated, rebased, changes })
  }, "manage_org_units")(req)
}

/**
 * DELETE — remove a leaf unit.
 *
 * Refuses rather than cascading: assets, work orders, users and schedules all
 * reference `orgUnitId`, and deleting a populated unit would either fail on the
 * foreign key or orphan the records. The response names what is in the way so
 * the admin knows what to move first.
 */
export async function DELETE(req: NextRequest, context: Ctx) {
  return withAuth(async (_req, user) => {
    const { id } = await context.params

    const node = await prisma.orgUnit.findUnique({ where: { id } })
    if (!node) return NextResponse.json({ error: "Org unit not found" }, { status: 404 })
    if (!canAccess(user.orgUnit.path, node.path)) {
      return NextResponse.json({ error: "Org unit is outside your scope" }, { status: 403 })
    }
    if (node.type === "COUNTRY") {
      return NextResponse.json({ error: "The root country cannot be deleted" }, { status: 400 })
    }

    const [children, users, assets, workOrders, schedules] = await Promise.all([
      prisma.orgUnit.count({ where: { parentId: node.id } }),
      prisma.user.count({ where: { orgUnitId: node.id } }),
      prisma.asset.count({ where: { orgUnitId: node.id } }),
      prisma.workOrder.count({ where: { orgUnitId: node.id } }),
      prisma.maintenanceSchedule.count({ where: { orgUnitId: node.id } }),
    ])

    const blockers: string[] = []
    if (children)    blockers.push(`${children} child unit${children === 1 ? "" : "s"}`)
    if (users)       blockers.push(`${users} user${users === 1 ? "" : "s"}`)
    if (assets)      blockers.push(`${assets} asset${assets === 1 ? "" : "s"}`)
    if (workOrders)  blockers.push(`${workOrders} work order${workOrders === 1 ? "" : "s"}`)
    if (schedules)   blockers.push(`${schedules} maintenance schedule${schedules === 1 ? "" : "s"}`)

    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: `"${node.name}" cannot be deleted — it still holds ${blockers.join(", ")}. Reassign them first.`,
          blockers: { children, users, assets, workOrders, schedules },
        },
        { status: 409 },
      )
    }

    await prisma.orgUnit.delete({ where: { id: node.id } })
    await bumpTreeVersion()
    await createAuditLog({
      performedById: user.id,
      action: `Deleted org unit "${node.name}" (${node.type})`,
      actionType: "ORG_STRUCTURE",
      metadata: { id: node.id, path: node.path },
    })

    return NextResponse.json({ success: true, deleted: node })
  }, "manage_org_units")(req)
}
