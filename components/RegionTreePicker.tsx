"use client"

import { useState } from "react"
import TreeNode from "./TreeNode"
import { useTree } from "./useTree"

export default function RegionTreePicker({
  value,
  onChange
}: {
  value?: string
  onChange: (id: string, node?: any) => void
}) {
  const { tree, expanded, toggle } = useTree()
  const [open, setOpen] = useState(false)


  function handleSelect(node: any) {
    const path = getPathLabel(tree, node.id)

    onChange(node.id, {
      ...node,
      pathLabel: path // ✅ pass full path
    })

    setOpen(false)
  }


  function findPath(node: any, targetId: string, path: any[] = []): any[] | null {
  if (!node) return null

  const newPath = [...path, node]

  if (node.id === targetId) return newPath

  if (node.children) {
    for (const child of node.children) {
      const result = findPath(child, targetId, newPath)
      if (result) return result
    }
  }

  return null
}

function getPathLabel(tree: any, id?: string) {
  if (!tree || !id) return ""

  const path = findPath(tree, id)
  if (!path) return ""

  return path.map(n => n.name).join(" / ")
}

  return (
    <div className="relative w-full">

      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full border p-2 rounded text-left bg-white"
      >
        {value ? getPathLabel(tree, value) : "Select Region"}
      </button>

      {/* Floating dropdown */}
      {open && (
        <>
          {/* click-away layer */}
          <div
            className="fixed inset-0"
            onClick={() => setOpen(false)}
          />

          <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow max-h-72 overflow-auto p-2">
            {tree && (
              <TreeNode
                node={tree}
                expanded={expanded}
                toggle={toggle}
                collapsed={false}
                level={0}
                onSelect={handleSelect}
                disableNavigation={true}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
