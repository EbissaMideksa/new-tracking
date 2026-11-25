// app/api/org/users/route.ts — GET: users for the org structure page.
// Returns users with role MANAGER / SUPERVISOR / USER, grouped by their
// department and org unit (section / group / area / site), so the client can
// render them under the matching OrgNode section/group chips.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { userSelect } from "@/lib/userSelect";

export async function GET(req: Request) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["MANAGER", "SUPERVISOR", "USER"] },
      },
      select: userSelect,
      orderBy: [{ orgUnit: { name: "asc" } }, { name: "asc" }],
    });
    return NextResponse.json({ users });
  } catch (e) {
    console.error("[api/org/users] failed", e);
    return NextResponse.json({ error: "Failed to load org users." }, { status: 500 });
  }
}