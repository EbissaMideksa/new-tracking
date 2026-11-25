// components/ClockChip.tsx
//
// Live date + time chip, shown in the topbar next to the notification bell when
// the clock button is toggled on. Renders nothing until mounted so the
// server-rendered markup and the client's first paint agree (no hydration
// mismatch on the clock text).

"use client"

import { useEffect, useState } from "react"

export default function ClockChip() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const i = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(i)
  }, [])

  if (!now) return null

  const date = now.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })

  return (
    <span
      className="hidden sm:flex"
      title={`${date} ${time}`}
      style={{
        alignItems: "center", gap: 6, whiteSpace: "nowrap",
        padding: "4px 10px", borderRadius: 8,
        background: "#f1f5f9", border: "1px solid #e2e8f0",
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: "#334155" }}>{date}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", fontVariantNumeric: "tabular-nums" }}>{time}</span>
    </span>
  )
}
