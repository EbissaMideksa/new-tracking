// components/UserSelector.tsx
import { useEffect, useState, ReactElement } from "react"  // ← import ReactElement

function UserSelector({
  tree,
  selected,
  onSelect,
}: {
  tree: any
  selected: string
  onSelect: (id: string) => void
}) {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchUsers() {
      try {
        // ← use /api/users/assignable — works for all roles with manage_work_orders
        const res = await fetch("/api/users/assignable")
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (Array.isArray(data)) {
          setUsers(data.sort((a: any, b: any) => a.name.localeCompare(b.name)))
        }
      } catch (err) {
        console.error("Failed to fetch users:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchUsers()
  }, [])

  function toggleOrg(orgId: string) {
    setExpandedOrgs((prev) => {
      const next = new Set(prev)
      next.has(orgId) ? next.delete(orgId) : next.add(orgId)
      return next
    })
  }

  if (loading) return <div style={{ padding: 8, fontSize: 11, color: "#9ca3af" }}>Loading users…</div>
  if (users.length === 0) return <div style={{ padding: 8, fontSize: 11, color: "#9ca3af" }}>No users found</div>

  // Group users by org unit
  const usersByOrg: Record<string, any[]> = {}
  users.forEach((u) => {
    const key = u.orgUnitId || "unassigned"
    if (!usersByOrg[key]) usersByOrg[key] = []
    usersByOrg[key].push(u)
  })

  // ← return type is ReactElement, not JSX.Element
  function renderOrgNode(node: any, level: number): ReactElement {
    const isExpanded = expandedOrgs.has(node.id)
    const hasChildren = (node.children?.length ?? 0) > 0
    const orgUsers = usersByOrg[node.id] ?? []

    return (
      <div key={node.id}>
        <div
          onClick={() => (orgUsers.length > 0 || hasChildren) && toggleOrg(node.id)}
          style={{
            display: "flex", alignItems: "center", gap: 3,
            padding: "4px 6px", paddingLeft: level * 14 + 4,
            cursor: "pointer", borderRadius: 3, marginBottom: 2,
            fontSize: 11, fontWeight: 500, color: "#374151",
          }}
        >
          <span style={{ fontSize: 10, color: "#6b7280", width: 12, textAlign: "center" }}>
            {hasChildren || orgUsers.length > 0 ? (isExpanded ? "▼" : "▶") : " "}
          </span>
          <span style={{ flex: 1 }}>📁 {node.name}</span>
          {orgUsers.length > 0 && (
            <span style={{ fontSize: 9, background: "#f3f4f6", color: "#6b7280", padding: "1px 5px", borderRadius: 2 }}>
              {orgUsers.length}
            </span>
          )}
        </div>

        {isExpanded && orgUsers.map((u: any) => {
          const isSel = selected === u.id
          return (
            <div
              key={u.id}
              onClick={() => onSelect(u.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "3px 8px", paddingLeft: level * 14 + 24,
                cursor: "pointer", borderRadius: 3, marginBottom: 1,
                background: isSel ? "#d1fae5" : "transparent",
                color: isSel ? "#065f46" : "#374151",
                fontSize: 11, fontWeight: isSel ? 600 : 400,
              }}
            >
              <span>👤</span>
              <span style={{ flex: 1 }}>{u.name}</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>{u.role}</span>
              {isSel && <span style={{ color: "#059669", fontSize: 12 }}>✓</span>}
            </div>
          )
        })}

        {isExpanded && hasChildren &&
          node.children.map((child: any) => renderOrgNode(child, level + 1))}
      </div>
    )
  }

  return <div>{tree && renderOrgNode(tree, 0)}</div>
}

export default UserSelector
