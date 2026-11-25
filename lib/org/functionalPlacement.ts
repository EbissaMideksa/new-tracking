import prisma from "@/lib/prisma"
import { OrgType } from "@/lib/enums"

export type Placement = { orgUnitId: string; path: string }

/**
 * userId → the mirrored node under the user's DEPARTMENT.
 * A field worker sits operationally at  <office>/zones/eaaz/bole  and
 * functionally at  <department>/zones/eaaz/bole  (same relative path).
 */
export async function functionalPlacements(): Promise<Map<string, Placement>> {
  const out = new Map<string, Placement>()
  const office = await prisma.orgUnit.findFirst({
    where: { type: OrgType.DEPUTY_CEO_OFFICE },
    select: { path: true },
  })
  if (!office) return out
  const prefix = office.path + "/"

  const users = await prisma.user.findMany({
    where: { departmentId: { not: null }, orgUnit: { path: { startsWith: prefix } } },
    select: {
      id: true,
      orgUnit: { select: { path: true } },
      department: { select: { path: true } },
    },
  })
  if (!users.length) return out

  const deptPaths = Array.from(new Set(users.map((u) => u.department!.path)))
  const units = await prisma.orgUnit.findMany({
    where: { OR: deptPaths.map((p) => ({ path: { startsWith: p + "/" } })) },
    select: { id: true, path: true },
  })
  const idByPath = new Map(units.map((u) => [u.path, u.id]))

  for (const u of users) {
    if (!u.department) continue
    const mirror = `${u.department.path}/${u.orgUnit.path.slice(prefix.length)}`
    const id = idByPath.get(mirror)
    if (id) out.set(u.id, { orgUnitId: id, path: mirror })
  }
  return out
}

