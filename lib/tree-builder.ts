
import prisma from "@/lib/prisma"

function countAssetsRecursive(node: any): number {
  let count = node.assets?.length || 0

  for (const child of node.children || []) {
    count += countAssetsRecursive(child)
  }

  node.totalAssets = count
  return count
}

export async function buildTree(user: any) {
  const basePath = user.orgUnit.path

  const orgUnits = await prisma.orgUnit.findMany({
    where: {
      path: {
        startsWith: basePath
      }
    },
    orderBy: {
      path: "asc"
    }
  })

  const assets = await prisma.asset.findMany({
    where:
      user.role === "USER"
        ? { orgUnitId: user.orgUnitId }
        : {
            orgUnit: {
              path: {
                startsWith: basePath
              }
            }
          }
  })

  const map = new Map()

  orgUnits.forEach((o) => {
    map.set(o.id, {
      ...o,
      children: [],
      assets: [],
      totalAssets: 0
    })
  })

  orgUnits.forEach((o) => {
    if (o.parentId && map.has(o.parentId)) {
      map.get(o.parentId).children.push(map.get(o.id))
    }
  })

  assets.forEach((a) => {
    if (map.has(a.orgUnitId)) {
      map.get(a.orgUnitId).assets.push(a)
    }
  })

  const root = map.get(user.orgUnitId)

  countAssetsRecursive(root)

  return root
}