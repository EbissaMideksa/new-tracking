// app/api/org/nodes/[id]/route.ts — PATCH (rename/recode, or assign the
// department's functional director) + DELETE (empty node only).
import { NextResponse } from "next/server";
import { canEditHierarchy } from "@/lib/org/permissions";
import { deleteOrgNode, OrgError, setDepartmentDirector, updateOrgNode } from "@/lib/org/orgService";

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
    // Functional-director assignment is a distinct payload — it must not fall
    // through to the rename path (which would reject an empty name).
    if ("directorUserId" in body || "directorName" in body) {
      const node = await setDepartmentDirector(id, {
        directorUserId: body?.directorUserId ?? null,
        directorName: body?.directorName ?? null,
      });
      return NextResponse.json({ node });
    }
    const node = await updateOrgNode(id, {
      name: body?.name,
      code: body?.code,
      subtitle: body?.subtitle,
    });
    return NextResponse.json({ node });
  } catch (e) {
    if (e instanceof OrgError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/org/nodes] patch failed", e);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: Ctx) {
  if (!(await canEditHierarchy())) {
    return NextResponse.json({ error: "Hierarchy editing requires elevated permission." }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const node = await deleteOrgNode(id);
    return NextResponse.json({ node });
  } catch (e) {
    if (e instanceof OrgError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api/org/nodes] delete failed", e);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}