// lib/utils.ts — shared utility functions extracted from duplicated code across the app.

// Role→org-unit-tier maps and the tree-shape rules live in lib/orgStructure.ts.

export function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?"
}

export function findPath(node: any, targetId: string): any[] | null {
  if (node.id === targetId) return [node]
  if (node.children) {
    for (const child of node.children) {
      const path = findPath(child, targetId)
      if (path) return [node, ...path]
    }
  }
  return null
}

