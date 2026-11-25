// app/api/org/units/route.ts — OrgNode-based endpoint.
// GET — list local units (optionally filtered by departmentId / zoneId).
// POST — create a geography workforce unit (LOCAL_UNIT) under a functional department.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canEditHierarchy } from "@/lib/org/permissions";
import { createLocalUnit, OrgError, getOrgOverview } from "@/lib/org/orgService";

export async function GET(req: Request) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get("departmentId") || undefined;
    const zoneId = searchParams.get("zoneId") || undefined;

    const overview = await getOrgOverview();

    // Flatten all units from the overview, optionally filtered
    let units = overview.divisions.flatMap((d) =>
      d.departments.flatMap((p) =>
        p.units.map((u) => ({ ...u, departmentId: p.id, departmentName: p.name, divisionId: d.id, divisionName: d.name }))
      )
    );

    if (departmentId) units = units.filter((u) => u.departmentId === departmentId);
    if (zoneId) units = units.filter((u) => u.zoneId === zoneId);

    return NextResponse.json({ units });
  } catch (e) {
    console.error("[api/org/units] GET failed", e);
    return NextResponse.json({ error: "Failed to load units." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await canEditHierarchy())) {
    return NextResponse.json({ error: "Hierarchy editing requires elevated permission." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : "";
  const zoneId = typeof body?.zoneId === "string" ? body.zoneId : "";
  if (!departmentId || !zoneId) {
    return NextResponse.json({ error: "departmentId and zoneId are required." }, { status: 400 });
  }
  try {
    const unit = await createLocalUnit(departmentId, zoneId);
    return NextResponse.json({ unit }, { status: 201 });
  } catch (e) {
    if (e instanceof OrgError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[org/units] create failed", e);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
