// lib/assetUpload.ts
// Shared helpers for asset upload (Excel) and manual/scanner bulk entry.
import prisma from "./prisma"
import { resolvePoliticalArea, type PoliticalAreaNode } from "./politicalArea"

// Returns the set of serial numbers (from the input) that already exist in the DB.
export async function findExistingSerials(serials: string[]): Promise<Set<string>> {
  if (serials.length === 0) return new Set()
  const found = await prisma.asset.findMany({
    where: { serialNumber: { in: serials } },
    select: { serialNumber: true },
  })
  return new Set(found.map((f) => f.serialNumber))
}

/** Max org-unit hops walked when resolving a political area. */
const MAX_ORG_DEPTH = 32

type OrgNode = { id: string; name: string; type: string; parentId: string | null; code?: string | null }

/**
 * Build the root-to-leaf ancestor chain for an org unit by walking parentId.
 * The shared resolver expects root-first order, so the upward walk is reversed.
 */
async function ancestorChain(start: OrgNode): Promise<PoliticalAreaNode[]> {
  const chain: OrgNode[] = [start]
  let current: OrgNode | null = start
  const seen = new Set<string>([start.id])

  for (let i = 0; i < MAX_ORG_DEPTH && current?.parentId; i++) {
    const parentId: string | null = current.parentId
    // A cyclic parentId would otherwise spin here; the schema does not forbid it.
    if (seen.has(parentId)) break
    seen.add(parentId)
    const parent: OrgNode | null = await prisma.orgUnit.findUnique({
      where: { id: parentId },
      select: { id: true, name: true, type: true, parentId: true, code: true },
    })
    if (!parent) break
    chain.push(parent)
    current = parent
  }

  return chain.reverse()
}

// Walk up the org hierarchy from `start` and resolve the asset's
// "Area (Political Admin)". Delegates to the shared resolver so the stored
// column and the table cell can never disagree.
export async function getPoliticalAreaForOrg(start: {
  id?: string
  name: string
  type: string
  parentId: string | null
  /** Zone/region code — the stable political key when a unit gets renamed. */
  code?: string | null
}): Promise<string | null> {
  const node: OrgNode = {
    id: start.id ?? "",
    name: start.name,
    type: start.type,
    parentId: start.parentId,
    code: start.code ?? null,
  }
  return resolvePoliticalArea(await ancestorChain(node))
}

/**
 * Resolve the political area for many org units at once.
 *
 * Used when assets move in bulk and by the political-area backfill. Loads the
 * units reachable from the given ids and walks the tree in memory — resolving
 * them individually would issue a findUnique per level per unit.
 */
export async function getPoliticalAreasForOrgUnits(
  orgUnitIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const ids = [...new Set(orgUnitIds)]
  if (ids.length === 0) return out

  const roots = await prisma.orgUnit.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, type: true, parentId: true, code: true },
  })
  if (roots.length === 0) return out

  const byId = new Map<string, OrgNode>(roots.map((r) => [r.id, r]))
  // Pull every ancestor level in bulk, one query per depth.
  let frontier = roots.map((r) => r.parentId).filter((p): p is string => !!p)

  for (let depth = 0; depth < MAX_ORG_DEPTH && frontier.length > 0; depth++) {
    const batch = [...new Set(frontier)].filter((id) => !byId.has(id))
    if (batch.length === 0) break
    const parents = await prisma.orgUnit.findMany({
      where: { id: { in: batch } },
      select: { id: true, name: true, type: true, parentId: true, code: true },
    })
    if (parents.length === 0) break
    frontier = []
    for (const p of parents) {
      byId.set(p.id, p)
      if (p.parentId) frontier.push(p.parentId)
    }
  }

  for (const root of roots) {
    const chain: OrgNode[] = [root]
    const seen = new Set<string>([root.id])
    let cur: OrgNode | undefined = root
    while (cur?.parentId && !seen.has(cur.parentId) && chain.length <= MAX_ORG_DEPTH) {
      const parent = byId.get(cur.parentId)
      if (!parent) break
      seen.add(parent.id)
      chain.push(parent)
      cur = parent
    }
    out.set(root.id, resolvePoliticalArea(chain.reverse()))
  }

  return out
}
