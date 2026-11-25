
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Network } from "lucide-react"

export default function TreeNode({
  node,
  expanded,
  toggle,
  level = 0,
  collapsed = false,
  onSelect,
  disableNavigation = false,
  // ── Org-structure icon (admins only) ────────────────────────────────────────
  // When the parent (the sidebar) sets `showStructureIcon` — it does so only for
  // ADMIN / SUPER_ADMIN — an org-structure glyph is rendered immediately BEFORE
  // the asset-count badge. Clicking it calls `onShowStructure(node)` so the
  // parent can show the structure of the branch under the logged-in user
  // without triggering the row's own filter navigation.
  // Both props default to off, so the other TreeNode consumers (RegionTreePicker,
  // AssignTreeSelector, …) keep their current behaviour.
  showStructureIcon = false,
  onShowStructure,
}: any) {

  const router = useRouter()
  const params = useSearchParams()

  const selectedOrg = params.get("org")
  const isOpen = expanded.has(node.id)
  const hasChildren = node.children?.length > 0

  
 function handleClick() {
  // 👉 selection mode (used in Region picker)
  if (onSelect) {
    onSelect(node)
    return
  }

  // 👉 navigation mode (sidebar default) — this IS the org filter: `?org=<id>`
  //    is what /dashboard, /dashboard/assets, /api/assets and
  //    /api/assets/analytics read to narrow data to one unit.
  if (!disableNavigation) {
    router.push(`/dashboard?org=${node.id}`)
  }
}

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer
          ${selectedOrg === node.id ? "bg-blue-100" : "hover:bg-gray-100"}
        `}
        style={{
          paddingLeft: collapsed ? "8px" : `${level * 16}px`
        }}
        onClick={handleClick}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggle(node.id)
            }}
            className="text-xs w-4"
          >
            {isOpen ? "▼" : "▶"}
          </button>
        )}

        <span className="flex-1 text-sm truncate">
          {collapsed
            ? node.name.charAt(0)
            : node.name}
        </span>

        {/* Org-structure icon — admin-only, placed BEFORE the total asset count */}
        {showStructureIcon && !collapsed && typeof onShowStructure === "function" && (
          <button
            type="button"
            title={`Organizational structure under ${node.name}`}
            aria-label={`Show organizational structure under ${node.name}`}
            onClick={(e) => {
              // Don't bubble into the row's filter navigation — this icon only
              // previews the structure, it doesn't change the active filter.
              e.stopPropagation()
              onShowStructure(node)
            }}
            className="shrink-0 rounded hover:bg-blue-100"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18, padding: 0, border: "none",
              background: "transparent", color: "#2563eb", cursor: "pointer",
            }}
          >
            <Network size={13} />
          </button>
        )}

        {!collapsed && (
          <span className="text-[10px] bg-green-100 px-2 rounded">
            {node.totalAssets || 0}
          </span>
        )}
      </div>

      {isOpen && !collapsed && (
        <div>
          {node.children?.map((child: any) => (
            <TreeNode
  key={child.id}
  node={child}
  expanded={expanded}
  toggle={toggle}
  level={level + 1}
  collapsed={collapsed}
  onSelect={onSelect}
  disableNavigation={disableNavigation}
  showStructureIcon={showStructureIcon}
  onShowStructure={onShowStructure}
/>
          ))}
        </div>
      )}
    </div>
  )
}
