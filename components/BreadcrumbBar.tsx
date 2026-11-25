
"use client"

import { useRouter } from "next/navigation"
import { useBreadcrumbs } from "@/context/BreadcrumbContext"

export default function BreadcrumbBar() {
  const { breadcrumbs, clearAfter, setBreadcrumbs } = useBreadcrumbs()
  const router = useRouter()

  if (!breadcrumbs.length) return null

  return (
    <div style={{
      background: "#fff",
      borderBottom: "1px solid #e2e8f0",
      padding: "7px 20px",
      display: "flex",
      alignItems: "center",
      gap: 2,
      flexShrink: 0,
      flexWrap: "wrap",
    }}>
      <button
        onClick={() => {
          setBreadcrumbs([])
          router.push("/dashboard")
        }}
        style={{
          fontSize: 12, color: "#64748b", background: "none",
          border: "none", cursor: "pointer", padding: "2px 6px",
          borderRadius: 4, display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v7a1 1 0 001 1h4v-5h2v5h4a1 1 0 001-1v-7h1a1 1 0 00.707-1.707l-7-7z"/>
        </svg>
        Home
      </button>

      {breadcrumbs.map((b, i) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span style={{ color: "#cbd5e1", fontSize: 12, userSelect: "none" }}>/</span>
          <button
          onClick={() => {
            // Asset breadcrumb is display-only
            if (b.type === "ASSET") return

            clearAfter(b.id)

            if (i === 0) {
              router.push("/dashboard")
            } else {
              router.push(`/dashboard?org=${b.id}`)
            }
          }}

            style={{
              fontSize: 12,
              fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
              color: i === breadcrumbs.length - 1 ? "#1d4ed8" : "#475569",
              background: i === breadcrumbs.length - 1 ? "#eff6ff" : "none",
              border: "none",
              cursor: b.type === "ASSET" ? "default" : "pointer",
              padding: "2px 7px",
              borderRadius: 4,
            }}
          >
            {b.name}
          </button>
        </div>
      ))}
    </div>
  )
}
