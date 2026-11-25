//components/AssignTreeSelector.tsx
"use client"

import { useState } from "react"

export default function AssignTreeSelector({
  tree,
  onSelect,
  assignableTypes,
  assignedAssetsMap = {}
}: any) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())

  const toggleNode = (id: string) => {
    setOpenNodes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const normalize = (v: any) =>
    (v || "").toString().toUpperCase().trim()

  const handleSelect = (node: any) => {
    const type = normalize(node.type)
    const allowed = assignableTypes.map(normalize)

    if (!allowed.includes(type)) {
      return
    }

    setSelectedId(node.id)

    // ✅ ALWAYS send ONLY ID (fix critical bug)
    onSelect(node.id)
  }

  if (!tree) return <p>Loading tree...</p>

  return (
    <div className="border rounded p-3 max-h-[400px] overflow-auto text-sm">
      <Tree
        node={tree}
        level={0}
        selectedId={selectedId}
        openNodes={openNodes}
        toggleNode={toggleNode}
        onSelect={handleSelect}
        assignableTypes={assignableTypes}
        assignedAssetsMap={assignedAssetsMap}
      />

      {!selectedId && (
        <p className="text-xs text-gray-500 mt-2">
          Click a valid node to select target
        </p>
      )}
    </div>
  )
}

function Tree({
  node,
  level,
  selectedId,
  openNodes,
  toggleNode,
  onSelect,
  assignableTypes,
  assignedAssetsMap
}: any) {

  const hasChildren = node.children?.length > 0

  const normalize = (v: any) =>
    (v || "").toString().toUpperCase().trim()

  const isSelectable = assignableTypes
    .map(normalize)
    .includes(normalize(node.type))

  const isSelected = selectedId === node.id
  const isOpen = openNodes.has(node.id)

  const assignedCount = assignedAssetsMap[node.id] || 0
  const isAssigned = assignedCount > 0

  const handleClick = () => {
    // 🔥 always attempt selection (debug-friendly)
    if (isSelectable) {
      onSelect(node)
    } else {
      // optional: show why it didn't work
      // Not selectable — skip
    }
  }

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 py-1 px-2 rounded transition-all

          ${isSelectable
            ? "cursor-pointer hover:bg-green-50 text-green-700"
            : "text-gray-400 opacity-60"}

          ${isSelected ? "bg-green-100 font-semibold" : ""}

          ${isAssigned ? "border-l-4 border-green-500 bg-green-50/40" : ""}
        `}
        style={{ paddingLeft: level * 14 }}
        onClick={handleClick}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleNode(node.id)
            }}
            className="text-xs w-4"
          >
            {isOpen ? "▼" : "▶"}
          </button>
        )}

        <span className="flex-1">
          {node.name}
        </span>

        <span className="text-[10px] text-gray-400">
          {node.type}
        </span>

        {assignedCount > 0 && (
          <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1 rounded">
            {assignedCount}
          </span>
        )}

        {isSelected && (
          <span className="text-green-700 font-bold">✔</span>
        )}
      </div>

      {hasChildren && isOpen && node.children.map((c: any) => (
        <Tree
          key={c.id}
          node={c}
          level={level + 1}
          selectedId={selectedId}
          openNodes={openNodes}
          toggleNode={toggleNode}
          onSelect={onSelect}
          assignableTypes={assignableTypes}
          assignedAssetsMap={assignedAssetsMap}
        />
      ))}
    </div>
  )
}
