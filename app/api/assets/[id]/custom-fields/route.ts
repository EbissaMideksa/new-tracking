// app/api/assets/[id]/custom-fields/route.ts
// Get and update custom field values for an asset.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"
import { canAccess } from "@/lib/rbac"

export const dynamic = "force-dynamic"

function parseCustomFields(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Resolve the asset and confirm the caller may touch it. Previously neither
 * handler performed an org-scope check, so any authenticated user could read
 * or overwrite the custom fields of any asset in the country.
 */
async function loadScopedAsset(id: string, viewerPath: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, customFields: true, orgUnit: { select: { path: true } } },
  })
  if (!asset) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const
  if (!canAccess(viewerPath, asset.orgUnit.path)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const
  }
  return { asset } as const
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadScopedAsset(id, user.orgUnit.path)
  if ("error" in result) return result.error

  return NextResponse.json({ customFields: parseCustomFields(result.asset.customFields) })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const result = await loadScopedAsset(id, user.orgUnit.path)
  if ("error" in result) return result.error

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const updated = await prisma.asset.update({
    where: { id },
    data: { customFields: JSON.stringify(body.customFields || {}) },
  })

  broadcastScoped("assets", { event: "updated", asset: updated }, result.asset.orgUnit.path)
  return NextResponse.json({ success: true, customFields: parseCustomFields(updated.customFields) })
}

