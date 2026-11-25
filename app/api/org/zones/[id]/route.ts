// app/api/org/zones/[id]/route.ts — PATCH: assign / clear a geography's shared
// Operational Director. One director per zone/region, never per department.
// Body: { directorUserId } (preferred, resolved server-side) or
//       { directorName } (legacy free-text). Both null/absent = unassign.
import { NextResponse } from "next/server";
import { canEditHierarchy } from "@/lib/org/permissions";
import { OrgError, setZoneDirector } from "@/lib/org/orgService";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: Ctx) {
  if (!(await canEditHierarchy())) {
    return NextResponse.json({ error: "Hierarchy editing requires elevated permission." }, { status: 403 });
  }
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  try {
    const zone = await setZoneDirector(id, {
      directorUserId: body?.directorUserId ?? null,
      directorName: body?.directorName ?? null,
    });
    return NextResponse.json({ zone });
  } catch (e) {
    if (e instanceof OrgError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/org/zones] patch failed", e);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}