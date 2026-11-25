// app/api/org/nodes/route.ts — POST: create a functional node (division or department).
// Gated by the same `manage_org_units` grant as the units endpoints.
import { NextResponse } from "next/server";
import { canEditHierarchy } from "@/lib/org/permissions";
import { createDepartment, createDivision, OrgError } from "@/lib/org/orgService";

export async function POST(req: Request) {
  if (!(await canEditHierarchy())) {
    return NextResponse.json({ error: "Hierarchy editing requires elevated permission." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const kind = typeof body?.kind === "string" ? body.kind : "";
  try {
    if (kind === "DIVISION") {
      const node = await createDivision({
        name: body?.name ?? "",
        code: body?.code,
        subtitle: body?.subtitle,
      });
      return NextResponse.json({ node }, { status: 201 });
    }
    if (kind === "DEPARTMENT") {
      const node = await createDepartment({
        parentId: body?.parentId ?? "",
        name: body?.name ?? "",
        subtitle: body?.subtitle,
        placement: body?.placement ?? null,
      });
      return NextResponse.json({ node }, { status: 201 });
    }
    return NextResponse.json({ error: "kind must be DIVISION or DEPARTMENT." }, { status: 400 });
  } catch (e) {
    if (e instanceof OrgError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/org/nodes] create failed", e);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}