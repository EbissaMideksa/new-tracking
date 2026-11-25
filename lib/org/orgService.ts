//lib/org/orgService.ts
import prisma from "@/lib/prisma"; // default export singleton (lib/prisma.ts)
import { ensureDepartmentDirector } from "./directors";
import { departmentCanSpread } from "../orgStructure";
import { buildUnitName, type OrgDepartment, type OrgDivision, type OrgOverview, type OrgUser } from "./types";
import { fetchOrgUsers } from "./orgApi";

export class OrgError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Whole hierarchy + zones, shaped for the client components.
 *
 * Built from the legacy `OrgUnit` tree — the SAME tree the admin org-structure
 * editor (/dashboard/admin/org-structure) writes and the Users/Assets pages
 * read — so a division/department/section created there shows up here
 * immediately.
 *
 * The org page still needs two OrgNode-only facts that OrgUnit cannot store:
 *   • the functional director of a department (OrgNode.department.director*)
 *   • the OrgNode department id for the director / add-unit flows
 * Both are resolved by matching the OrgNode department by name (best-effort).
 * Zones + their Operational Directors keep coming from `GeoZone`. */

export async function getOrgOverview(): Promise<OrgOverview> {
  const [orgUnits, zones, deptNodes, users] = await Promise.all([
    prisma.orgUnit.findMany({ orderBy: { path: "asc" } }),
    prisma.geoZone.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.orgNode.findMany({
      where: { kind: "DEPARTMENT" as any },
      select: { id: true, name: true, directorName: true, directorUserId: true },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        orgUnitId: true,
        orgUnit: { select: { name: true, type: true } },
      },
    }),
  ]);

  const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const isType = (u: { type: unknown }, t: string) => String(u.type) === t;

  const byParent = new Map<string, typeof orgUnits>();
  for (const u of orgUnits) {
    if (!u.parentId) continue;
    const arr = byParent.get(u.parentId) ?? [];
    arr.push(u);
    byParent.set(u.parentId, arr);
  }
  const childrenOf = (id: string) => byParent.get(id) ?? [];

  const root =
    orgUnits.find((u) => isType(u, "COUNTRY") && !u.parentId) ??
    orgUnits.find((u) => !u.parentId) ??
    null;

  const zoneByCode = new Map(zones.map((z) => [z.code, z]));

  // OrgNode department by name — director + node id (for OrgNode-backed flows).
  const deptNodeByName = new Map<string, (typeof deptNodes)[number]>();
  for (const n of deptNodes) if (!deptNodeByName.has(norm(n.name))) deptNodeByName.set(norm(n.name), n);

  // Users grouped by the org unit they sit on (corporate section/group heads).
  const usersByOrgUnit = new Map<string, OrgUser[]>();
  for (const u of users) {
    if (!u.orgUnitId) continue;
    const arr = usersByOrgUnit.get(u.orgUnitId) ?? [];
    arr.push({
      id: u.id,
      name: u.name,
      email: u.email,
      role: String(u.role),
      orgUnitName: u.orgUnit?.name ?? null,
      orgUnitType: (u.orgUnit?.type as string | undefined) ?? null,
    });
    usersByOrgUnit.set(u.orgUnitId, arr);
  }

  const divisions: OrgDivision[] = childrenOf(root?.id ?? "")
    .filter((u) => isType(u, "DIVISION"))
    .map((div) => {
      const departments: OrgDepartment[] = childrenOf(div.id)
        .filter((u) => isType(u, "DEPARTMENT"))
        .map((dept) => {
          // Corporate arm: sections directly under the department (corporate-only
          // rule) OR under a CORPORATE grouping child (legacy seeded shape).
          const corporateChildren = childrenOf(dept.id).filter((c) => isType(c, "CORPORATE"));
          const sectionNodes = [
            ...childrenOf(dept.id).filter((c) => isType(c, "SECTION")),
            ...corporateChildren.flatMap((c) => childrenOf(c.id).filter((x) => isType(x, "SECTION"))),
          ];
          const sections = sectionNodes.map((sec) => ({
            id: sec.id,
            name: sec.name,
            groups: childrenOf(sec.id)
              .filter((g) => isType(g, "GROUP"))
              .map((g) => ({ id: g.id, name: g.name, users: usersByOrgUnit.get(g.id) ?? [] })),
            users: usersByOrgUnit.get(sec.id) ?? [],
          }));

          const categories = childrenOf(dept.id)
            .filter((c) => isType(c, "CATEGORY"))
            .map((c) => ({ id: c.id, name: c.name, kind: "CATEGORY" as const }));

          // Field-arm local units: ZONE/REGION nodes under the department's
          // categories. zoneId points at the GeoZone (matched by code) so the
          // page's zone lookups + Operational Director keep resolving.
          const units = categories.flatMap((cat) =>
            childrenOf(cat.id)
              .filter((x) => isType(x, "ZONE") || isType(x, "REGION"))
              .map((zr) => {
                const gz = zoneByCode.get(zr.code ?? "");
                return {
                  id: `unit-${zr.id}`,
                  name: zr.name,
                  zoneId: gz?.id ?? zr.id,
                  zoneCode: zr.code ?? zr.name,
                };
              }),
          );

          const dn = deptNodeByName.get(norm(dept.name));
          return {
            id: dept.id,
            nodeId: dn?.id ?? null,
            name: dept.name,
            directorName: dn?.directorName ?? null,
            directorUserId: dn?.directorUserId ?? null,
            placement: (dept as any).placement ?? null,
            units,
            categories,
            sections,
          };
        });

      return {
        id: div.id,
        code: div.code ?? div.name,
        name: div.name,
        subtitle: "",
        departments,
      };
    });

  const zoneUnitCount = new Map<string, number>();
  for (const u of orgUnits) {
    if ((isType(u, "ZONE") || isType(u, "REGION")) && u.code) {
      zoneUnitCount.set(u.code, (zoneUnitCount.get(u.code) ?? 0) + 1);
    }
  }

  return {
    name: root?.name ?? "Ethiopia",
    corporate: {
      id: root?.id ?? "corp",
      name: root?.name ?? "Ethiopia",
      subtitle: "",
    },
    divisions,
    zones: zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      category: z.category as any,
      directorName: z.directorName,
      directorUserId: z.directorUserId,
      unitCount: zoneUnitCount.get(z.code) ?? 0,
    })),
  };
}

/** Creates "<ZONE> <DIV> <Department>" under the department. The zone's director is inherited. */
export async function createLocalUnit(departmentId: string, zoneId: string) {
  const dept = await prisma.orgNode.findUnique({
    where: { id: departmentId },
    include: { parent: true },
  });
  if (!dept || dept.kind !== "DEPARTMENT" || !dept.parent) {
    throw new OrgError("Functional parent must be a department.", 422);
  }
  // Placement rule: a corporate-only department has no field arm — refuse to
  // place one of its local workforce units in any geography. The admin must
  // flip the department to SPREADABLE first.
  if (!departmentCanSpread((dept as any).placement)) {
    throw new OrgError(
      `"${dept.name}" is corporate-only and cannot hold local units. Change its placement to "spreadable" first.`,
      422
    );
  }
  const zone = await prisma.geoZone.findUnique({ where: { id: zoneId } });
  if (!zone) throw new OrgError("Zone not found.", 422);

  const name = buildUnitName(zone.code, dept.parent.code ?? dept.parent.name, dept.name);
  try {
    return await prisma.orgNode.create({
      data: { kind: "LOCAL_UNIT", name, parentId: dept.id, zoneId: zone.id },
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      throw new OrgError(`${name} already exists.`, 409);
    }
    throw e;
  }
}

// ── Hierarchy editing ────────────────────────────────────────────────────────

/** The CORPORATE root node, created on first use so the editor always has a base. */
async function ensureCorporate() {
  const existing = await prisma.orgNode.findFirst({ where: { kind: "CORPORATE" } });
  if (existing) return existing;
  return prisma.orgNode.create({
    data: { kind: "CORPORATE", name: "Ethiopia", subtitle: "Organization root" },
  });
}

export async function createDivision(input: { name: string; code?: string; subtitle?: string }) {
  const name = input.name?.trim();
  if (!name) throw new OrgError("Division name is required.", 422);
  const corp = await ensureCorporate();
  const clash = await prisma.orgNode.findFirst({
    where: { parentId: corp.id, kind: "DIVISION", name },
  });
  if (clash) throw new OrgError(`A division named "${name}" already exists.`, 409);
  return prisma.orgNode.create({
    data: {
      kind: "DIVISION",
      name,
      code: input.code?.trim() || null,
      subtitle: input.subtitle?.trim() || null,
      parentId: corp.id,
    },
  });
}

/** Children auto-created under every new department (the local workforce
 *  hierarchy). SECTION groups corporate workers; GROUP sits under a section.
 *  Spreadable departments additionally get the Zones/Regions CATEGORY folders
 *  so their field-arm local units can be placed. Corporate-only departments
 *  keep only the corporate arm — no field-side children. */
const CORPORATE_GROUP_COUNT = 2;



/** Create a department under a division (placement: CORPORATE_ONLY or SPREADABLE). */
export async function createDepartment(input: {
  name: string;
  code?: string;
  subtitle?: string;
  parentId: string;
  placement?: string | null;
}) {
  const name = input.name?.trim();
  if (!name) throw new OrgError("Department name is required.", 422);
  const parent = await prisma.orgNode.findUnique({ where: { id: input.parentId } });
  if (!parent || parent.kind !== "DIVISION") {
    throw new OrgError("Parent must be a division.", 422);
  }
  const clash = await prisma.orgNode.findFirst({
    where: { parentId: parent.id, kind: "DEPARTMENT", name },
  });
  if (clash) throw new OrgError(`"${parent.name}" already has a department named "${name}".`, 409);

  // Normalise placement: NULL / "" → SPREADABLE (backwards-compatible default).
  const placement =
    input.placement && String(input.placement).trim() !== ""
      ? String(input.placement).toUpperCase()
      : "SPREADABLE";
  if (placement !== "CORPORATE_ONLY" && placement !== "SPREADABLE") {
    throw new OrgError(`placement must be "CORPORATE_ONLY" or "SPREADABLE".`, 422);
  }

  const dept = await prisma.orgNode.create({
    data: {
      kind: "DEPARTMENT",
      name,
      subtitle: input.subtitle?.trim() || null,
      parentId: parent.id,
      placement,
    },
  });

  // ── Local workforce hierarchy (corporate arm) ──────────────────────────
  // Every department gets a SECTION with GROUP(s) under it — this is where
  // corporate workers sit (User.orgUnitId on the group, User.departmentId on
  // the department). A section may also go directly to users when no group
  // tier is configured, but we always provision at least one group.
  try {
    const sectionName = `${parent.code ?? parent.name} ${name} HQ`;
    const section = await prisma.orgNode.create({
      data: { kind: "SECTION" as any, name: sectionName, parentId: dept.id },
    });
    for (let g = 1; g <= CORPORATE_GROUP_COUNT; g++) {
      await prisma.orgNode.create({
        data: { kind: "GROUP" as any, name: `HQ Group-${g}`, parentId: section.id },
      });
    }
  } catch (err) {
    // Non-fatal: the department itself is still created. Groups can be added
    // later from the hierarchy editor.
    console.error("[org] failed to provision section/groups for", name, err);
  }

  // ── Field-arm categories (spreadable only) ─────────────────────────────
  if (placement === "SPREADABLE") {
    try {
      await prisma.orgNode.create({
        data: { kind: "CATEGORY" as any, name: "Zones", parentId: dept.id },
      });
      await prisma.orgNode.create({
        data: { kind: "CATEGORY" as any, name: "Regions", parentId: dept.id },
      });
    } catch (err) {
      console.error("[org] failed to provision field categories for", name, err);
    }
  }

  // A department always has a functional director (design §1): place one as
  // soon as the department is created. Best-effort — the department itself is
  // still created if provisioning the account fails, and the assignment can
  // be redone from the hierarchy screen.
  try {
    await ensureDepartmentDirector(dept, parent);
  } catch (err) {
    console.error("[org] failed to place a functional director on", name, err);
  }
  return prisma.orgNode.findUnique({ where: { id: dept.id } });
}

/** Rename / recode a corporate, division or department node. */
export async function updateOrgNode(
  id: string,
  patch: { name?: string; code?: string; subtitle?: string }
) {
  const node = await prisma.orgNode.findUnique({ where: { id } });
  if (!node) throw new OrgError("Node not found.", 404);
  if (node.kind === "LOCAL_UNIT") {
    throw new OrgError("Local units are managed through their zone — delete and re-create instead.", 422);
  }
  const data: Record<string, string | null> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new OrgError("Name cannot be empty.", 422);
    data.name = name;
  }
  if (patch.code !== undefined) data.code = patch.code.trim() || null;
  if (patch.subtitle !== undefined) data.subtitle = patch.subtitle.trim() || null;
  if (Object.keys(data).length === 0) throw new OrgError("Nothing to update.", 422);
  return prisma.orgNode.update({ where: { id }, data });
}

/** Delete an empty division / department / local unit. Refuses to cascade. */
export async function deleteOrgNode(id: string) {
  const node = await prisma.orgNode.findUnique({ where: { id }, include: { children: true } });
  if (!node) throw new OrgError("Node not found.", 404);
  if (node.kind === "CORPORATE") throw new OrgError("The organization root cannot be deleted.", 422);
  if (node.children.length > 0) {
    throw new OrgError(
      `"${node.name}" still has ${node.children.length} child unit(s). Remove them first.`,
      409
    );
  }
  return prisma.orgNode.delete({ where: { id } });
}

/** Assign (or clear) the shared Operational Director of a geography.
 *  Accepts a user id (preferred — resolved to the canonical display name) or
 *  a bare display name for backwards compatibility. */
export async function setZoneDirector(
  zoneId: string,
  input: { directorUserId?: string | null; directorName?: string | null }
) {
  const zone = await prisma.geoZone.findUnique({ where: { id: zoneId } });
  if (!zone) throw new OrgError("Geography not found.", 404);

  // Clearing: both ids given as null/empty.
  const wantsUser = typeof input.directorUserId === "string" && input.directorUserId.trim() !== "";
  const wantsName = typeof input.directorName === "string" && input.directorName.trim() !== "";
  if (!wantsUser && !wantsName) {
    return prisma.geoZone.update({
      where: { id: zoneId },
      data: { directorUserId: null, directorName: null },
    });
  }

  if (wantsUser) {
    const user = await prisma.user.findUnique({
      where: { id: input.directorUserId!.trim() },
      select: { id: true, name: true },
    });
    if (!user) throw new OrgError("Selected director was not found.", 422);
    return prisma.geoZone.update({
      where: { id: zoneId },
      data: { directorUserId: user.id, directorName: user.name },
    });
  }

  const name = input.directorName!.trim().replace(/\s+/g, " ");
  return prisma.geoZone.update({
    where: { id: zoneId },
    data: { directorName: name, directorUserId: null },
  });
}

/** Assign (or clear) the functional director of a single DEPARTMENT node.
 *  The Operational Director of a geography is never set here — the two roles
 *  are tracked separately (spec §1, §7). */
export async function setDepartmentDirector(
  nodeId: string,
  input: { directorUserId?: string | null; directorName?: string | null }
) {
  const node = await prisma.orgNode.findUnique({ where: { id: nodeId } });
  if (!node || node.kind !== "DEPARTMENT") {
    throw new OrgError("Functional directors are only set on departments.", 422);
  }

  const wantsUser = typeof input.directorUserId === "string" && input.directorUserId.trim() !== "";
  const wantsName = typeof input.directorName === "string" && input.directorName.trim() !== "";
  if (!wantsUser && !wantsName) {
    return prisma.orgNode.update({
      where: { id: nodeId },
      data: { directorUserId: null, directorName: null },
    });
  }

  if (wantsUser) {
    const user = await prisma.user.findUnique({
      where: { id: input.directorUserId!.trim() },
      select: { id: true, name: true },
    });
    if (!user) throw new OrgError("Selected director was not found.", 422);
    return prisma.orgNode.update({
      where: { id: nodeId },
      data: { directorUserId: user.id, directorName: user.name },
    });
  }

  const name = input.directorName!.trim().replace(/\s+/g, " ");
  return prisma.orgNode.update({
    where: { id: nodeId },
    data: { directorName: name, directorUserId: null },
  });
}
