// app/api/org/overview/route.ts — GET endpoint for org overview data.
// Returns the full hierarchy (corporate → divisions → departments → local units) + zones.
// Read access: any signed-in user (the dashboard layout already gates auth);
// writes are gated separately per endpoint behind `manage_org_units`.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrgOverview } from "@/lib/org/orgService";

export async function GET() {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ overview: await getOrgOverview() });
  } catch (e) {
    console.error("[api/org/overview] failed", e);
    return NextResponse.json({ error: "Failed to load org overview." }, { status: 500 });
  }
}
