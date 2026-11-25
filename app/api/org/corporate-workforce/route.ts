// app/api/org/corporate-workforce/route.ts
// GET /api/org/corporate-workforce?division=<name>&department=<name>
//
// Corporate-arm workforce of one department (Corporate → Section → Group),
// rendered by the Organization page. Without this route the GET fell through
// to /api/org/[id] (PATCH/DELETE only) and returned 405.
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  CorporateLookupError,
  getDepartmentCorporateWorkforce,
} from "@/lib/org/corporateWorkforce"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const me = (await getCurrentUser()) as any
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const division = sp.get("division")?.trim() || ""
  const department = sp.get("department")?.trim() || ""
  if (!division || !department) {
    return NextResponse.json(
      { error: "division and department are required" },
      { status: 400 },
    )
  }

  try {
    const data = await getDepartmentCorporateWorkforce({
      divisionName: division,
      departmentName: department,
    })
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof CorporateLookupError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    throw e
  }
}