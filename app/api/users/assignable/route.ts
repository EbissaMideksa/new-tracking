
// app/api/users/assignable/route.ts

import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { targetTypesFor } from "@/lib/orgStructure"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isFullAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role)

  // The tiers this role may hand work to. A full admin sees everyone in scope;
  // everyone else is limited to users sitting on one of their tier(s). An empty
  // list means the role has no assignable tier at all (USER, GROUP, …) — refuse
  // it outright rather than silently returning every in-scope user.
  const allowedTypes: string[] = isFullAdmin ? [] : targetTypesFor(user.role)

  if (!isFullAdmin && allowedTypes.length === 0) {
    return NextResponse.json(
      { error: "Your role cannot assign work orders" },
      { status: 403 }
    )
  }

  const users = await prisma.user.findMany({
    where: {
      // removed `active: true` — field does not exist in User model
      orgUnit: {
        path: { startsWith: user.orgUnit.path },
        // `in` accepts the shared OrgTypeName strings; Prisma wants its own enum
        // type, which is the same literal union — cast rather than re-exporting.
        ...(allowedTypes.length > 0 ? { type: { in: allowedTypes } as any } : {}),
      },
    },
    select: {
      id:        true,
      name:      true,
      email:     true,
      role:      true,
      orgUnitId: true,
      orgUnit:   { select: { id: true, name: true, type: true, path: true } },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(users)
}
