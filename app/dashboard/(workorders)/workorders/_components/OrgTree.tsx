
// app/dashboard/(workorders)/workorders/_components/OrgTree.tsx
"use client"

import { useState } from "react"

type Props = {
  node:     any
  selected: string
  onSelect: (id: string) => void
  level?:   number
}

export default function OrgTree({ node, selected, onSelect, level = 0 }: Props) {
  const [open, setOpen] = useState(level < 1)
  const hasKids = node.children?.length > 0
  const isSel   = selected === node.id

  return (
    <div>
      <div
        onClick={() => onSelect(node.id)}
        style={{
          display: "flex", alignItems: "center", gap: 3,
          padding: "3px 4px", paddingLeft: level * 12 + 4,
          borderRadius: 3, cursor: "pointer",
          background: isSel ? "#d1fae5" : "transparent",
          color:      isSel ? "#065f46"  : "#374151",
          fontSize: 11, fontWeight: isSel ? 600 : 400, marginBottom: 1,
        }}
        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "#f0fdf4" }}
        onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent" }}
      >
        {hasKids ? (
          <button
            onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 8, width: 10, padding: 0, flexShrink: 0 }}
          >
            {open ? "▼" : "▶"}
          </button>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {node.name}
        </span>
        <span style={{ fontSize: 8, color: "#d1d5db", flexShrink: 0 }}>{node.type}</span>
      </div>

      {open && hasKids && node.children.map((c: any) => (
        <OrgTree key={c.id} node={c} selected={selected} onSelect={onSelect} level={level + 1} />
      ))}
    </div>
  )
}
