// lib/reportsTo.ts
//
// "Reports To" = the immediate higher-level boss, DERIVED (never stored as a
// free choice). A user's boss is the nearest person one-or-more ranks ABOVE
// them in the departmentalization chain (CHIEF > DIRECTOR > MANAGER >
// SUPERVISOR > USER), found by walking UP the org tree from where they SIT.
//
// Why walk the tree and not just look on the same unit: a user almost never
// shares a unit with their boss. A field USER sits on a site; their SUPERVISOR
// is on the parent area; the operational DIRECTOR is on the zone/region above
// that. A corporate USER sits on a group; the section MANAGER is on the parent
// section. So the boss lives in an ANCESTOR unit, and the nearest ancestor that
// hosts a strictly-higher-rank person is the immediate boss.
//
// This module is server-only (it queries Prisma) — unlike lib/orgStructure.ts,
// which must stay dependency-free for the browser. ROLE_RANK is imported from
// there so the two agree on the ladder.

import prisma from "@/lib/prisma"
import { ROLE_RANK } from "@/lib/orgStructure"

type Person = { id: string; role: string; createdAt: Date; orgUnitId: string }

/**
 * The id of the immediate higher-level boss for a user of `role` sitting on
 * `orgUnitId`, or null when nobody ranks above them anywhere up the tree (a
 * CHIEF, or an operational director whose only superior is the headless Deputy
 * CEO Office — which carries no account).
 *
 * `excludeUserId` guards an update: a user must never be resolved as their own
 * boss (relevant when their stored role still outranks the role being saved).
 */
export async function findImmediateBoss(
  role: string,
  orgUnitId: string,
  opts: { excludeUserId?: string } = {},
): Promise<string | null> {
  const myRank = ROLE_RANK[String(role ?? "").toUpperCase()]
  // Unknown role (SUPER_ADMIN/ADMIN are not on the ladder) or the top (CHIEF)
  // has no boss to derive.
  if (myRank === undefined || myRank === 0) return null

  const unit = await prisma.orgUnit.findUnique({
    where: { id: orgUnitId },
    select: { path: true },
  })
  if (!unit) return null

  // Every ancestor path (self + each prefix), nearest (longest) first.
  const segs = unit.path.split("/")
  const ancestorPaths = segs
    .map((_, i) => segs.slice(0, i + 1).join("/"))
    .sort((a, b) => b.split("/").length - a.split("/").length)

  const ancestors = await prisma.orgUnit.findMany({
    where: { path: { in: ancestorPaths } },
    select: { id: true, path: true },
  })
  ancestors.sort((a, b) => b.path.split("/").length - a.path.split("/").length)
  const ancestorIds = ancestors.map((a) => a.id)
  if (ancestorIds.length === 0) return null

  const people: Person[] = await prisma.user.findMany({
    where: {
      orgUnitId: { in: ancestorIds },
      ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
    },
    select: { id: true, role: true, createdAt: true, orgUnitId: true },
  })

  const byUnit = new Map<string, Person[]>()
  for (const p of people) {
    const list = byUnit.get(p.orgUnitId)
    if (list) list.push(p)
    else byUnit.set(p.orgUnitId, [p])
  }

  // Walk nearest-first. The first ancestor that hosts a strictly-higher-rank
  // person wins; within it, the closest rank (then the earliest account) is the
  // most immediate boss.
  for (const anc of ancestors) {
    const higher = (byUnit.get(anc.id) ?? [])
      .map((p) => ({ ...p, rank: ROLE_RANK[String(p.role).toUpperCase()] }))
      .filter((p) => p.rank !== undefined && p.rank < myRank)
      .sort((a, b) => b.rank! - a.rank! || a.createdAt.getTime() - b.createdAt.getTime())
    if (higher.length > 0) return higher[0].id
  }
  return null
}
