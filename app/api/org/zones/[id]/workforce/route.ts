
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"
//import { getZoneWorkforce } from "@/lib/org/workforce"
import { WorkforceLookupError, getZoneWorkforce } from "@/lib/org/workforce"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/org/zones/EAAZ/workforce                      → whole zone (Operational Director view)
// GET /api/org/zones/EAAZ/workforce?division=..&department=..  → one functional department
export async function GET(req: NextRequest, ctx: Ctx) {
  const me = (await getCurrentUser()) as any
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await ctx.params
  const sp = req.nextUrl.searchParams
  const division = sp.get("division")?.trim() || null
  const department = sp.get("department")?.trim() || null

  if (!id) return NextResponse.json({ error: "zone id required" }, { status: 400 })
  if (!!division !== !!department) {
    return NextResponse.json({ error: "division and department must be given together" }, { status: 400 })
  }


    let result
  try {
    result = await getZoneWorkforce({
      zoneCode: id,
      divisionName: division,
      departmentName: department,
    })
  } catch (e) {
    if (e instanceof WorkforceLookupError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    throw e
  }
  if (!result) return NextResponse.json({ error: "Zone or department not found" }, { status: 404 })

  const { zonePath, ...data } = result
  if (me.role !== "SUPER_ADMIN") {
    const mine = me.orgUnitId
      ? await prisma.orgUnit.findUnique({ where: { id: me.orgUnitId }, select: { path: true } })
      : null
    const inScope =
      (mine && zonePath.startsWith(mine.path)) ||
      (data.department && me.departmentId === data.department.id)
    if (!inScope) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json(data)
}
