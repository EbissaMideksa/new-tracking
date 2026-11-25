import prisma from "@/lib/prisma"
import { OrgType } from "@/lib/enums"
import type { WorkforceNode, WorkforceUser, ZoneWorkforce } from "./workforceTypes"

export class CorporateLookupError extends Error {}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 0, ADMIN: 1, CHIEF: 2, DIRECTOR: 3, MANAGER: 4, SUPERVISOR: 5, USER: 6,
}
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true })

/**
 * Corporate-arm people of one department: users whose departmentId is the
 * department AND whose org unit sits inside the department's own branch
 * (Corporate HQ / Corporate Support → Section → Group). Field workers sit under
 * the Deputy CEO Office instead, so they are excluded by the path filter.
 */
export async function getDepartmentCorporateWorkforce(input: {
  divisionName: string
  departmentName: string
}): Promise<ZoneWorkforce & { deptPath: string }> {
  const divUnits = await prisma.orgUnit.findMany({
    where: { type: OrgType.DIVISION },
    select: { name: true, path: true },
  })
  const divNameBySlug = new Map(divUnits.map((u) => [u.path.split("/")[1], u.name]))

  const divNodes = await prisma.orgNode.findMany({
    where: { kind: "DIVISION" as any },
    select: { name: true, code: true, subtitle: true },
  })
  const given = input.divisionName
  const node = divNodes.find((n) => [n.name, n.code, n.subtitle].some((v) => v && norm(v) === norm(given)))
  const names = [given, node?.subtitle, node?.name].filter(Boolean).map((v) => norm(v as string))

  const candidates = await prisma.orgUnit.findMany({
    where: { type: OrgType.DEPARTMENT, name: input.departmentName },
    select: { id: true, name: true, path: true },
  })
  const dept = candidates.find((c) => names.includes(norm(divNameBySlug.get(c.path.split("/")[1]) ?? "")))
  if (!dept) {
    throw new CorporateLookupError(
      `Department "${input.departmentName}" in division "${given}" not found. ` +
        `Divisions in DB: ${divUnits.map((u) => u.name).join(", ") || "none"}`,
    )
  }
  const divName = divNameBySlug.get(dept.path.split("/")[1]) ?? ""

  const deptNodes = await prisma.orgNode.findMany({
    where: { kind: "DEPARTMENT" as any, name: dept.name },
    select: { directorName: true, parent: { select: { subtitle: true, name: true } } },
  })
  const fnNode = deptNodes.find(
    (n) => norm(n.parent?.subtitle ?? "") === norm(divName) || norm(n.parent?.name ?? "") === norm(divName),
  )

  const units = await prisma.orgUnit.findMany({
    where: { path: { startsWith: dept.path + "/" } },
    select: { id: true, name: true, type: true, path: true },
  })
  const unitByPath = new Map(units.map((u) => [u.path, u]))

  const users = await prisma.user.findMany({
    where: { departmentId: dept.id, orgUnit: { path: { startsWith: dept.path + "/" } } },
    select: {
      id: true, name: true, email: true, role: true, status: true, jobTitle: true,
      orgUnit: { select: { path: true } },
    },
  })

  const root: WorkforceNode = { id: dept.id, name: dept.name, type: "DEPARTMENT", users: [], children: [], total: 0 }
  const nodes = new Map<string, WorkforceNode>([[dept.path, root]])
  const ensure = (path: string): WorkforceNode => {
    const hit = nodes.get(path)
    if (hit) return hit
    const parent = ensure(path.slice(0, path.lastIndexOf("/")))
    const u = unitByPath.get(path)
    const n: WorkforceNode = {
      id: u?.id ?? path,
      name: u?.name ?? path.split("/").pop()!,
      type: String(u?.type ?? "UNIT"),
      users: [], children: [], total: 0,
    }
    parent.children.push(n)
    nodes.set(path, n)
    return n
  }

  const roleCounts: Record<string, number> = {}
  for (const u of users) {
    const wu: WorkforceUser = {
      id: u.id, name: u.name, email: u.email, role: String(u.role),
      status: u.status ? String(u.status) : null,
      jobTitle: u.jobTitle ?? null,
      department: `${divName} · ${dept.name}`,
    }
    ensure(u.orgUnit.path).users.push(wu)
    roleCounts[wu.role] = (roleCounts[wu.role] ?? 0) + 1
  }

  const finish = (n: WorkforceNode): number => {
    n.users.sort((a, b) => (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99) || byName(a, b))
    n.children.sort(byName)
    n.total = n.users.length + n.children.reduce((s, c) => s + finish(c), 0)
    return n.total
  }
  finish(root)

  return {
    zone: { id: dept.id, code: "CORP", name: "Corporate" },
    department: { id: dept.id, name: dept.name },
    scope: "department",
    operationalDirector: null,
    functionalDirector: fnNode?.directorName ?? null,
    departments: [`${divName} · ${dept.name}`],
    directUsers: root.users,
    tree: root.children,
    total: root.total,
    roleCounts,
    deptPath: dept.path,
  }
}
