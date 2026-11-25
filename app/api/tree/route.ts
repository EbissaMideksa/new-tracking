
// app/api/tree/route.ts

import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { redis, getTreeVersion } from "@/lib/redis"

export async function GET() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Cache the (expensive) tree per user scope. The org tree changes rarely;
  // a 30s TTL keeps it fresh while skipping the heavy remote-Neon query on
  // every dashboard page load. Cache is best-effort: if Redis is down, fall
  // back to the DB query below.
  //
  // The key carries the org-structure version (lib/redis.ts) so an edit made
  // through /api/org invalidates every scope at once instead of leaving
  // viewers on a pre-edit tree for the rest of the TTL.
  const cacheKey = `tree:${await getTreeVersion()}:${user.orgUnit.path}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return NextResponse.json(JSON.parse(cached))
  } catch {}

  // Fetch the flat org list (NO relations) + asset counts in parallel.
  // `children` is rebuilt from parentId below, and `assets` was only used to
  // count — a grouped count is one small query instead of loading every asset.
  const [orgs, assetCounts] = await Promise.all([
    prisma.orgUnit.findMany({
      where: { path: { startsWith: user.orgUnit.path } },
    }),
    prisma.asset.groupBy({
      by: ["orgUnitId"],
      _count: { _all: true },
      where: { orgUnit: { path: { startsWith: user.orgUnit.path } } },
    }),
  ])

  const countMap = new Map(assetCounts.map((c) => [c.orgUnitId, c._count._all]))

  const map = new Map()
  orgs.forEach((o) => map.set(o.id, { ...o, children: [] }))

  let root: any = null

  orgs.forEach((o) => {
    if (o.parentId && map.has(o.parentId)) {
      map.get(o.parentId).children.push(map.get(o.id))
    } else if (o.path === user.orgUnit.path) {
      root = map.get(o.id)
    }
  })

  function addCounts(node: any): any {
    let total = countMap.get(node.id) || 0

    if (node.children?.length) {
      node.children = node.children.map(addCounts)
      total += node.children.reduce(
        (sum: number, c: any) => sum + c.totalAssets,
        0
      )
    }

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      // Division short code + department placement rule — the editor renders
      // both (code chip; CORPORATE_ONLY departments hide the Categories
      // option), so they must survive the slim-down.
      code: node.code,
      placement: node.placement,
      children: node.children,
      totalAssets: total
    }
  }

  const tree = addCounts(root)

  try {
    await redis.set(cacheKey, JSON.stringify(tree), "EX", 30)
  } catch {}

  return NextResponse.json(tree)
}
