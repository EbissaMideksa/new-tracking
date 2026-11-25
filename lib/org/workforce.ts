import prisma from "@/lib/prisma"
import { OrgType } from "@/lib/enums"
import type { WorkforceNode, WorkforceUser, ZoneWorkforce } from "./workforceTypes"

export class WorkforceLookupError extends Error {
  constructor(message: string) {
    super(message)
  }
}

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-")
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 0, ADMIN: 1, CHIEF: 2, DIRECTOR: 3, MANAGER: 4, SUPERVISOR: 5, USER: 6,
}
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true })

export async function getZoneWorkforce(input: {
  zoneCode: string
  divisionName?: string | null
  departmentName?: string | null
}): Promise<(ZoneWorkforce & { zonePath: string }) | null> {
  const office = await prisma.orgUnit.findFirst({
    where: { type: OrgType.DEPUTY_CEO_OFFICE },
    select: { path: true },
  })
  if (!office) throw new WorkforceLookupError("No Deputy CEO Office org unit found — has the seed run?")

  // Zone/region node: by code, falling back to the path slug (older seeds left code null)
  const zoneCandidates = await prisma.orgUnit.findMany({
    where: { path: { startsWith: office.path + "/" }, type: { in: [OrgType.ZONE, OrgType.REGION] } },
    select: { id: true, name: true, path: true, code: true },
  })
  const wanted = norm(input.zoneCode)
  const zone =
    zoneCandidates.find((z) => z.code && norm(z.code) === wanted) ??
    zoneCandidates.find((z) => norm(z.path.split("/").pop() ?? "") === wanted) ??
    zoneCandidates.find((z) => norm(z.name) === wanted)
  if (!zone) {
    throw new WorkforceLookupError(
      `Zone "${input.zoneCode}" not found under ${office.path}. Found: ${zoneCandidates
        .map((z) => z.code ?? z.path.split("/").pop())
        .join(", ") || "none"}`,
    )
  }

  const geo = await prisma.geoZone.findUnique({
    where: { code: input.zoneCode },
    select: { directorName: true },
  })

  const divUnits = await prisma.orgUnit.findMany({
    where: { type: OrgType.DIVISION },
    select: { name: true, path: true },
  })
  const divNameBySlug = new Map(divUnits.map((d) => [d.path.split("/")[1], d.name]))

  const deptNodes = await prisma.orgNode.findMany({
    where: { kind: "DEPARTMENT" as any },
    select: { name: true, directorName: true, parent: { select: { subtitle: true } } },
  })
  const fnDirector = new Map(
    deptNodes.map((n) => [`${slug(n.parent?.subtitle ?? "")}|${n.name}`, n.directorName ?? null]),
  )

  // Resolve the department when scoped to one
  let deptFilter: { id: string; name: string; divSlug: string } | null = null
  if (input.departmentName) {
    // The client may send a subtitle ("Fixed Network"), name ("FN Division") or code ("FN").
    // Normalise through the OrgNode division so all of them resolve to the OrgUnit division.
    const given = input.divisionName ?? ""
    const divNodes = await prisma.orgNode.findMany({
      where: { kind: "DIVISION" as any },
      select: { name: true, code: true, subtitle: true },
    })
    const node = divNodes.find(
      (n) => [n.name, n.code, n.subtitle].some((v) => v && norm(v) === norm(given)),
    )
    const names = [given, node?.subtitle, node?.name].filter(Boolean).map((v) => norm(v as string))

    const candidates = await prisma.orgUnit.findMany({
      where: { type: OrgType.DEPARTMENT, name: input.departmentName },
      select: { id: true, name: true, path: true },
    })
    const hit = candidates.find((d) => {
      const divName = divNameBySlug.get(d.path.split("/")[1]) ?? ""
      return names.includes(norm(divName))
    })
    if (!hit) {
      throw new WorkforceLookupError(
        `Department "${input.departmentName}" in division "${given}" not found. ` +
          `Divisions in DB: ${divUnits.map((d) => d.name).join(", ") || "none"}`,
      )
    }
    deptFilter = { id: hit.id, name: hit.name, divSlug: hit.path.split("/")[1] }
  }

  const units = await prisma.orgUnit.findMany({
    where: { path: { startsWith: zone.path + "/" } },
    select: { id: true, name: true, type: true, path: true },
  })
  const unitByPath = new Map(units.map((u) => [u.path, u]))

  // Workers in this operational office come from TWO sources:
  //   • NEW model — orgUnitId is the FUNCTIONAL unit, so they are matched by
  //     their explicit zone/region (User.geoZoneId).
  //   • Legacy — still seated on the field arm under the zone path.
  // Corporate workers (geoZoneId null, orgUnit outside the zone) are excluded.
  const underZone = { OR: [{ path: zone.path }, { path: { startsWith: zone.path + "/" } }] }
  const users = await prisma.user.findMany({
    where: {
      ...(deptFilter ? { departmentId: deptFilter.id } : {}),
      OR: [
        // New model — matched purely by their operational zone/region.
        { geoZoneId: zone.id },
        // Legacy — seated on the field arm under the zone path.
        {
          geoZoneId: null,
          orgUnit: underZone,
          ...(deptFilter ? {} : { departmentId: { not: null } }),
        },
      ],
    },
    select: {
      id: true, name: true, email: true, role: true, status: true, jobTitle: true,
      orgUnit: { select: { path: true } },
      department: { select: { name: true, path: true } },
    },
  })

  const root: WorkforceNode = {
    id: zone.id, name: zone.name, type: "ZONE", users: [], children: [], total: 0,
  }
  const nodes = new Map<string, WorkforceNode>([[zone.path, root]])

  const ensure = (path: string): WorkforceNode => {
    const hit = nodes.get(path)
    if (hit) return hit
    const parent = ensure(path.slice(0, path.lastIndexOf("/")))
    const u = unitByPath.get(path)
    const node: WorkforceNode = {
      id: u?.id ?? path,
      name: u?.name ?? path.split("/").pop()!,
      type: String(u?.type ?? "UNIT"),
      users: [], children: [], total: 0,
    }
    parent.children.push(node)
    nodes.set(path, node)
    return node
  }

  const roleCounts: Record<string, number> = {}
  const deptLabels = new Set<string>()

  for (const u of users) {
    const divSlug = u.department?.path.split("/")[1] ?? ""
    const label = u.department
      ? `${divNameBySlug.get(divSlug) ?? divSlug} · ${u.department.name}`
      : null
    if (label) deptLabels.add(label)

    const wu: WorkforceUser = {
      id: u.id, name: u.name, email: u.email, role: String(u.role),
      status: u.status ? String(u.status) : null,
      jobTitle: u.jobTitle ?? null,
      department: label,
    }
    // Seated on the field arm → place in the tree; otherwise (new functional
    // model) → populate directly into this operational office.
    const underZonePath =
      u.orgUnit.path === zone.path || u.orgUnit.path.startsWith(zone.path + "/")
    if (underZonePath) ensure(u.orgUnit.path).users.push(wu)
    else root.users.push(wu)
    roleCounts[wu.role] = (roleCounts[wu.role] ?? 0) + 1
  }

  const finish = (n: WorkforceNode): number => {
    n.users.sort((a, b) =>
      (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99) || byName(a, b))
    n.children.sort(byName)
    n.total = n.users.length + n.children.reduce((s, c) => s + finish(c), 0)
    return n.total
  }
  finish(root)

  return {
    zone: { id: zone.id, code: zone.code ?? input.zoneCode, name: zone.name },
    department: deptFilter ? { id: deptFilter.id, name: deptFilter.name } : null,
    scope: deptFilter ? "department" : "zone",
    operationalDirector: geo?.directorName ?? null,
    functionalDirector: deptFilter
      ? fnDirector.get(`${deptFilter.divSlug}|${deptFilter.name}`) ?? null
      : null,
    departments: Array.from(deptLabels).sort(),
    directUsers: root.users,
    tree: root.children,
    total: root.total,
    roleCounts,
    zonePath: zone.path,
  }
}
