
// app/api/assets/bulk/route.ts
// Manual / scanner batch entry of assets with duplicate-serial detection.
// Rejects (does not insert) any asset whose serialNumber already exists in the
// DB or is duplicated within the batch, and reports which serials were rejected.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccess } from "@/lib/rbac"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { canWithMatrix } from "@/lib/adminGrants"
import { broadcastScoped, broadcastGlobal } from "@/lib/broadcast"
import { createAuditLog } from "@/lib/audit"
import { findExistingSerials, getPoliticalAreaForOrg } from "@/lib/assetUpload"
import { effectiveCan } from "@/lib/effectivePermissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { targetTypesFor, describeTargets } from "@/lib/orgStructure"

const toStr = (v: any): string | undefined => (v != null && v !== "" ? String(v) : undefined)

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const matrix = await loadPermissionsFromDB()
    const overrides = await loadUserOverrides(user.id)
    if (!effectiveCan(matrix, user.role, "upload_assets", overrides.admin))
          return NextResponse.json({ error: "You do not have upload permission" }, { status: 403 })

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }

    const targetOrgUnitId = body?.orgUnitId
    const assets: any[] = Array.isArray(body?.assets) ? body.assets : []
    if (!targetOrgUnitId) return NextResponse.json({ error: "Target node is required" }, { status: 400 })
    if (assets.length === 0) return NextResponse.json({ error: "No assets provided" }, { status: 400 })
    if (assets.length > 1000) return NextResponse.json({ error: "Too many assets (max 1000)" }, { status: 400 })

    const targetOrg = await prisma.orgUnit.findUnique({ where: { id: targetOrgUnitId } })
    if (!targetOrg) return NextResponse.json({ error: "Invalid target" }, { status: 404 })
    if (!canAccess(user.orgUnit.path, targetOrg.path))
      return NextResponse.json({ error: "Target outside your scope" }, { status: 403 })

    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN"
    if (!isAdmin) {
      const allowedTypes = targetTypesFor(user.role)
      if (allowedTypes.length > 0 && !allowedTypes.includes(targetOrg.type as any))
        return NextResponse.json({ error: `Your role may only upload to ${describeTargets(user.role)} units` }, { status: 403 })
      if (allowedTypes.length === 0)
        return NextResponse.json({ error: "Your role may not upload assets" }, { status: 403 })
    }

    const politicalArea = await getPoliticalAreaForOrg(targetOrg)

    // ── Validate rows + detect within-batch duplicate serials ──
    const seen = new Set<string>()
    const duplicateInBatch: string[] = []
    const errors: { serial?: string; reason: string }[] = []
    const validRows: any[] = []

    for (const a of assets) {
      const serial = toStr(a.serialNumber)
      const itemCode = toStr(a.itemCode)
      if (!serial || !itemCode) {
        errors.push({ serial: serial ?? "(none)", reason: "Missing serialNumber or itemCode" })
        continue
      }
      if (seen.has(serial)) { duplicateInBatch.push(serial); continue }
      seen.add(serial)
      validRows.push({
        itemCode:            String(itemCode),
        itemCodeDescription: toStr(a.itemCodeDescription),
        tagNumber:           toStr(a.tagNumber),
        serialNumber:        String(serial),
        assetDescription:    toStr(a.assetDescription),
        category:            toStr(a.category),
        owningDepartment:    toStr(a.owningDepartment),
        criticality:         toStr(a.criticality),
        wipClass:            toStr(a.wipClass),
        politicalArea:       politicalArea ?? toStr(a.politicalArea),
        active:              true,
        checkedOut:          false,
        operational:         true,
        orgUnitId:           targetOrgUnitId,
      })
    }

    // ── Detect serials that already exist in the DB → reject them ──
    const existingSet = await findExistingSerials(validRows.map((r) => r.serialNumber))
    const duplicates = validRows.filter((r) => existingSet.has(r.serialNumber)).map((r) => r.serialNumber)
    const toInsert = validRows.filter((r) => !existingSet.has(r.serialNumber))

    if (toInsert.length === 0) {
      return NextResponse.json({
        success: false, inserted: 0, duplicates, duplicateInBatch, errors: errors.slice(0, 10),
      })
    }

    await prisma.asset.createMany({ data: toInsert })

    const inserted = await prisma.asset.findMany({
      where: { orgUnitId: targetOrgUnitId, serialNumber: { in: toInsert.map((r) => r.serialNumber) } },
      include: { orgUnit: { select: { id: true, name: true, type: true, path: true } } },
      orderBy: { createdAt: "desc" },
      take: toInsert.length,
    })
    for (const asset of inserted)
      broadcastScoped("assets", { event: "created", asset }, asset.orgUnit?.path)

    await createAuditLog({
      performedById: user.id,
      action: `Added ${toInsert.length} asset(s) to ${targetOrg.name} (manual/scanner)`,
      actionType: "ASSET_MANAGEMENT",
      targetAssetTag: targetOrg.name,
    })
  broadcastGlobal("audit", { event: "invalidate" })

  return NextResponse.json({
    success: true, inserted: toInsert.length, duplicates, duplicateInBatch, errors: errors.slice(0, 10),
  })

  } catch (err) {
    console.error("[assets/bulk] ERROR:", err)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
