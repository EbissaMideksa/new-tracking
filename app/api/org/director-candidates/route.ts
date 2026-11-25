
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/withAuth"

export const dynamic = "force-dynamic"

// GET /api/org/director-candidates?q=abe&roles=DIRECTOR,CHIEF,MANAGER
export const GET = withAuth(async (req) => {
  const sp = req.nextUrl.searchParams
  const q = sp.get("q")?.trim() ?? ""
  const roles = (sp.get("roles") ?? "DIRECTOR,CHIEF,MANAGER")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)

  const users = await prisma.user.findMany({
    where: {
      role: { in: roles as any },
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      orgUnit: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: 50,
  })

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: String(u.role),
      orgUnitName: u.orgUnit?.name ?? null,
    })),
  )
}, "org_hierarchy_manage")
