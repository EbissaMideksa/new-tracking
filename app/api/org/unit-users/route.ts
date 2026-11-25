import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { functionalPlacements } from "@/lib/org/functionalPlacement"

export const dynamic = "force-dynamic"

// Org tiers that represent the OPERATIONAL (field) arm. Everyone else
// (DIVISION, DEPARTMENT, CORPORATE, SECTION, GROUP, CATEGORY) is FUNCTIONAL.
const OPERATIONAL_TYPES = new Set([
  "DEPUTY_CEO_OFFICE",
  "ZONE",
  "REGION",
  "AREA",
  "SITE",
])

// GET /api/org/unit-users?orgUnitId=…
//
// Shows a node's people classified by their FUNCTIONAL placement, not by where
// their org unit happens to sit. A field worker (org unit on an area/site) is
// shown under their functional department as FUNCTIONAL, and is NOT listed
// under the operational geography nodes — so newly created users appear under
// the functional unit, as intended.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("orgUnitId")
  if (!id) return NextResponse.json({ error: "orgUnitId required" }, { status: 400 })

  const node = await prisma.orgUnit.findUnique({
    where: { id },
    select: { id: true, path: true, type: true },
  })
  if (!node) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!node.path.startsWith(me.orgUnit.path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const nodeIsOperational = OPERATIONAL_TYPES.has(String(node.type))

  // Functional placements are only meaningful for functional nodes.
  const functionalIds = nodeIsOperational
    ? []
    : [...(await functionalPlacements())]
        .filter(([, p]) => p.path === node.path || p.path.startsWith(node.path + "/"))
        .map(([userId]) => userId)

  const underNode = {
    OR: [{ path: node.path }, { path: { startsWith: node.path + "/" } }],
  }

  const rows = await prisma.user.findMany({
    where: nodeIsOperational
      ? // Operational node → only people who sit here with no functional
        // department (operational directors). Field workers belong to a
        // functional unit and are shown there instead.
        { orgUnit: underNode, departmentId: null }
      : // Functional node → people who sit in it, plus field workers whose
        // functional placement is under it.
        { OR: [{ orgUnit: underNode }, { id: { in: functionalIds } }] },
    select: {
      id: true, name: true, email: true, role: true,
      orgUnit: { select: { name: true, type: true, path: true } },
      department: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: 300,
  })

  return NextResponse.json(
    rows.map((u) => {
      const orgIsOperational = OPERATIONAL_TYPES.has(String(u.orgUnit.type))
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: String(u.role),
        // For functional nodes, a field worker's displayed unit is their
        // functional department; corporate staff show their section/group.
        unit: nodeIsOperational
          ? u.orgUnit.name
          : orgIsOperational
            ? (u.department?.name ?? u.orgUnit.name)
            : u.orgUnit.name,
        department: u.department?.name ?? null,
        via: nodeIsOperational ? "operational" : "functional",
      }
    }),
  )
}