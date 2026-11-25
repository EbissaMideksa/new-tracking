
// app/api/assets/upload/route.ts
// Additions: org-scoped broadcastScoped("assets", { event, asset }, orgPath) after insert

import * as XLSX from "xlsx"
import prisma from "@/lib/prisma"
import { NextResponse, NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccess } from "@/lib/rbac"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { canWithMatrix } from "@/lib/adminGrants"
import { broadcastScoped, broadcastGlobal } from "@/lib/broadcast"   // ← scoped
import { createAuditLog } from "@/lib/audit"
import { findExistingSerials, getPoliticalAreaForOrg } from "@/lib/assetUpload"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"
import { targetTypesFor } from "@/lib/orgStructure"

const normalize = (str: string) =>
  str?.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim()

const columnMap: Record<string, string[]> = {
  itemCode:            ["item code", "asset group", "asset group (item code)"],
  itemCodeDescription: ["item code description", "item code desc"],
  tagNumber:           ["asset number", "tag number", "asset number (tag number)", "asset number tag number"],
  serialNumber:        ["asset serial number", "serial number", "asset serial number permanent", "eqp serial number permanent"],
  assetDescription:    ["asset description"],
  category:            ["category"],
  owningDepartment:    ["owning department"],
  criticality:         ["criticality"],
  wipClass:            ["wip acct class", "wip class"],
  politicalArea:       ["area", "area political administration", "area ( political administraiton)"],
  maintainable:        ["maintainable"],
  active:              ["active"],
  productionOrg:       ["production org", "production org (for manufacturing)"],
  equipmentItem:       ["equipment item", "equipment item (tools, instruments, machineryies)"],
  eqpSerial:           ["eqp serial number"],
  faCategory:          ["fixed asset category", "fixed asset category (to be provided by finance)"],
  faNumber:            ["fixed asset number"],
  parentAsset:         ["parent asset number"],
  parentSerial:        ["parent asset serial number"],
  locationName:        ["property location name", "property location name (to be filled by property manager)"],
  locationCode:        ["property location code", "property location code ( site id)", "site id"],
  address:             ["address"],
  warrantyExpiration:  ["warranty expiration"],
  checkedOut:          ["checked out"],
  faSynced:            ["fa synchronized", "fa synchnronized"],
  operational:         ["operational flag"],
  customFlag:          ["[ ]", "spare", "custom flag"],
  wirelessSiteId:      ["wireless site id"],
}

const getMapped = (row: any, keys: string[]) => {
  for (const [colName, value] of Object.entries(row)) {
    const normalizedCol = normalize(colName)
    for (const key of keys) {
      if (normalizedCol.includes(normalize(key))) return value
    }
  }
  return undefined
}

function toBoolean(val: any): boolean | undefined {
  if (val === undefined || val === null || val === "") return undefined
  if (typeof val === "boolean") return val
  const s = String(val).toLowerCase().trim()
  return s === "yes" || s === "true" || s === "1" || s === "y"
}

function getAllowedChildType(role: string): string | null {
  // Kept as a wrapper so this route keeps its original contract: a single
  // preferred tier, or null when the role has none (admins handled by caller).
  return targetTypesFor(role)[0] ?? null
}

// Walk up the org hierarchy from the upload target to find its REGION or ZONE
// ancestor — used as the asset's "Area (Political Admin)".
// Political area comes from the shared resolver (lib/politicalArea.ts via
// lib/assetUpload) so the stored column can never disagree with the table
// cell. The private copy that used to live here only knew about REGION/ZONE
// by NAME and ignored CORPORATE, so the same upload produced a different area
// than a move did.
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const matrix = await loadPermissionsFromDB()
    const overrides = await loadUserOverrides(user.id)
    if (!effectiveCan(matrix, user.role, "upload_assets", overrides.admin)) {
      return NextResponse.json({ error: "You do not have upload permission" }, { status: 403 })
    }

    const formData        = await req.formData()
    const file            = formData.get("file")      as File
    const targetOrgUnitId = formData.get("orgUnitId") as string

    if (!file)            return NextResponse.json({ error: "No file uploaded" },        { status: 400 })
    if (!targetOrgUnitId) return NextResponse.json({ error: "Target node is required" }, { status: 400 })

    const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 })
    }

    const targetOrg = await prisma.orgUnit.findUnique({ where: { id: targetOrgUnitId } })
    if (!targetOrg) return NextResponse.json({ error: "Invalid target" }, { status: 404 })

    if (!canAccess(user.orgUnit.path, targetOrg.path)) {
      return NextResponse.json({ error: "Target outside your scope" }, { status: 403 })
    }

    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN"
    if (!isAdmin) {
      const allowedType = getAllowedChildType(user.role)
      if (allowedType && targetOrg.type !== allowedType) {
        return NextResponse.json(
          { error: `Your role may only upload to ${allowedType} units` },
          { status: 403 }
        )
      }
    }

    // Derive the political area from the target unit's REGION/ZONE ancestor
    const politicalArea = await getPoliticalAreaForOrg(targetOrg)

    const buffer   = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const sheet    = workbook.Sheets[workbook.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet)

    if (!rows.length) return NextResponse.json({ error: "Empty file" }, { status: 400 })

    const validRows: any[] = []
    const errors:    any[] = []
    let skipped = 0

    for (const r of rows) {
      const itemCode = getMapped(r, columnMap.itemCode)
      const serial   = getMapped(r, columnMap.serialNumber)

      if (!itemCode || !serial) {
        skipped++
        errors.push({ row: r, reason: "Missing itemCode or serialNumber" })
        continue
      }

      const toStr = (val: any): string | undefined =>
  val != null && val !== "" ? String(val) : undefined
      
      validRows.push({
        itemCode:            String(itemCode),
        itemCodeDescription: toStr(getMapped(r, columnMap.itemCodeDescription)),
        tagNumber:           toStr(getMapped(r, columnMap.tagNumber)),
        serialNumber:        String(serial),
        assetDescription:    toStr(getMapped(r, columnMap.assetDescription)),
        category:            toStr(getMapped(r, columnMap.category)),
        owningDepartment:    toStr(getMapped(r, columnMap.owningDepartment)),
        criticality:         toStr(getMapped(r, columnMap.criticality)),
        wipClass:            toStr(getMapped(r, columnMap.wipClass)),
        politicalArea:       politicalArea ?? toStr(getMapped(r, columnMap.politicalArea)),
        maintainable:        toBoolean(getMapped(r, columnMap.maintainable)),
        active:              toBoolean(getMapped(r, columnMap.active)) ?? true,
        productionOrg:      toStr(getMapped(r, columnMap.productionOrg)),
        equipmentItem:       toStr(getMapped(r, columnMap.equipmentItem)),
        eqpSerial:           toStr(getMapped(r, columnMap.eqpSerial)),
        faCategory:          toStr(getMapped(r, columnMap.faCategory)),
        faNumber:            toStr(getMapped(r, columnMap.faNumber)),
        parentAsset:         toStr(getMapped(r, columnMap.parentAsset)),
        parentSerial:        toStr(getMapped(r, columnMap.parentSerial)),
        locationName:        toStr(getMapped(r, columnMap.locationName)),
        locationCode:        toStr(getMapped(r, columnMap.locationCode)),
        address:             toStr(getMapped(r, columnMap.address)),
        warrantyExpiration:  toStr(getMapped(r, columnMap.warrantyExpiration)),
        checkedOut:          toBoolean(getMapped(r, columnMap.checkedOut))  ?? false,
        faSynced:            toBoolean(getMapped(r, columnMap.faSynced))    ?? false,
        operational:         toBoolean(getMapped(r, columnMap.operational)) ?? true,
        customFlag:          toBoolean(getMapped(r, columnMap.customFlag))  ?? false,
        wirelessSiteId:      toStr(getMapped(r, columnMap.wirelessSiteId)),
        orgUnitId:           targetOrgUnitId,
      })
    }

    if (validRows.length === 0) {
      return NextResponse.json({ success: false, inserted: 0, skipped, duplicates: [], errors })
    }

    // ── Duplicate-serial detection: reject serials that already exist ──
    const existingSet = await findExistingSerials(validRows.map(r => r.serialNumber))
    const duplicates  = validRows.filter(r => existingSet.has(r.serialNumber)).map(r => r.serialNumber)
    const toInsert    = validRows.filter(r => !existingSet.has(r.serialNumber))

    if (toInsert.length === 0) {
      return NextResponse.json({ success: false, inserted: 0, skipped, duplicates, errors: errors.slice(0, 5) })
    }

    await prisma.asset.createMany({ data: toInsert })

    // ── Broadcast each inserted asset to live subscribers ─────────────────────
    // Re-query the just-inserted records so we have real IDs + relations
    const inserted = await prisma.asset.findMany({
      where: { orgUnitId: targetOrgUnitId, serialNumber: { in: toInsert.map(r => r.serialNumber) } },
      include: { orgUnit: { select: { id:true, name:true, type:true, path:true } } },
      orderBy: { createdAt: "desc" },
      take: toInsert.length,
    })
    for (const asset of inserted) {
      broadcastScoped("assets", { event: "created", asset }, asset.orgUnit?.path)
    }
    // ─────────────────────────────────────────────────────────────────────────

    await createAuditLog({
      performedById: user.id,
      action: `Uploaded ${toInsert.length} asset(s) to ${targetOrg.name}`,
      actionType: "ASSET_MANAGEMENT",
      targetAssetTag: targetOrg.name,
    })
    broadcastGlobal("audit", { event: "invalidate" })

    return NextResponse.json({ success: true, inserted: toInsert.length, skipped, duplicates, errors: errors.slice(0, 5) })

  } catch (err) {
    console.error("UPLOAD ERROR:", err)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
