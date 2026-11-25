// app/api/assets/[id]/photo/route.ts
// Upload a photo for an asset (stored on Filebase S3, same as avatars).

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcastScoped } from "@/lib/broadcast"
import { uploadPhoto } from "@/lib/storage"
import { canAccess } from "@/lib/rbac"

export const dynamic = "force-dynamic"

/**
 * Resolve the asset and confirm the caller may touch it. Neither handler here
 * previously performed an org-scope check, so any authenticated user could
 * attach or clear the photo of any asset in the country.
 */
async function loadScopedAssetId(id: string, viewerPath: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { orgUnit: { select: { path: true } } },
  })
  if (!asset) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const
  if (!canAccess(viewerPath, asset.orgUnit.path)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const
  }
  return { orgPath: asset.orgUnit.path } as const
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const scope = await loadScopedAssetId(id, user.orgUnit.path)
  if ("error" in scope) return scope.error

  const formData = await req.formData()
  const file = formData.get("photo") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  // Size check (use avatar_max_size_mb setting, default 4MB)
  const maxSize = 4 * 1024 * 1024
  if (file.size > maxSize) {
    return NextResponse.json({ error: `File too large (max ${maxSize / 1024 / 1024}MB)` }, { status: 400 })
  }

  try {
    const url = await uploadPhoto(file, `asset-${id}`)

    const updated = await prisma.asset.update({
      where: { id },
      data: { photoUrl: url },
    })

    broadcastScoped("assets", { event: "updated", asset: updated }, scope.orgPath)
    return NextResponse.json({ success: true, photoUrl: url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const scope = await loadScopedAssetId(id, user.orgUnit.path)
  if ("error" in scope) return scope.error

  const updated = await prisma.asset.update({
    where: { id },
    data: { photoUrl: null },
  })

  broadcastScoped("assets", { event: "updated", asset: updated }, scope.orgPath)
  return NextResponse.json({ success: true })
}

