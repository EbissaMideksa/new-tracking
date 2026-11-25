
// components/settings/ChangePasswordForm.tsx
"use client"

import { useState } from "react"
import { Eye, EyeOff, ShieldCheck, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

// ── PasswordField is defined OUTSIDE the parent component ─────────────────────
// If it were defined inside, React would see a new component type on every render,
// unmount + remount the <input>, and focus would be lost after the first keystroke.
//
// CSS fix: inputBase uses ONLY longhand border-* properties (no shorthand "border").
// Mixing shorthand "border" with longhand "borderColor" in onFocus/onBlur causes
// the React warning "Removing a style property during rerender (borderColor) when
// a conflicting property is set (border)".  Using only longhands avoids this.

interface FieldProps {
  label: string
  value: string
  show: boolean
  onToggle: () => void
  onChange: (v: string) => void
  errorBorder?: boolean
}

// ── All longhand, no "border" shorthand ──────────────────────────────────────
const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "8px 40px 8px 12px",
  fontSize: 13,
  // Longhands only — never mix with the "border" shorthand
  borderWidth:  "1px",
  borderStyle:  "solid",
  borderColor:  "#e2e8f0",
  borderRadius: 7,
  background:   "#f8fafc",
  color:        "#0f172a",
  outline:      "none",
  transition:   "border-color 0.15s, box-shadow 0.15s",
  fontFamily:   "inherit",
}

function PasswordField({ label, value, show, onToggle, onChange, errorBorder }: FieldProps) {
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "#64748b", marginBottom: 5, display: "block",
  }

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          style={{
            ...inputBase,
            // Override borderColor only — all other border longhands stay from inputBase
            borderColor: errorBorder ? "#fca5a5" : "#e2e8f0",
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = "#2563eb"
            e.currentTarget.style.boxShadow   = "0 0 0 3px #bfdbfe55"
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = errorBorder ? "#fca5a5" : "#e2e8f0"
            e.currentTarget.style.boxShadow   = "none"
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            color: "#94a3b8", display: "flex", padding: 0,
          }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  userId: string
  /**
   * Forced change (app/change-password): the rest of the app is closed until
   * this succeeds, so on success go straight to the dashboard instead of only
   * showing the green banner.
   */
  forced?: boolean
}

export default function ChangePasswordForm({ userId, forced = false }: Props) {
  const [current, setCurrent] = useState("")
  const [next,    setNext]    = useState("")
  const [confirm, setConfirm] = useState("")
  const [showCur, setShowCur] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showCon, setShowCon] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState<{ type: "success" | "error"; text: string } | null>(null)

  const strength = (() => {
    if (!next) return 0
    let s = 0
    if (next.length >= 8)          s++
    if (/[A-Z]/.test(next))        s++
    if (/[0-9]/.test(next))        s++
    if (/[^A-Za-z0-9]/.test(next)) s++
    return s
  })()
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength]
  const strengthColor = ["", "#ef4444", "#f59e0b", "#22c55e", "#2563eb"][strength]

  async function handleChange() {
    if (!current || !next || !confirm) {
      setMsg({ type: "error", text: "All fields are required." }); return
    }
    if (next !== confirm) {
      setMsg({ type: "error", text: "New passwords do not match." }); return
    }
    if (next.length < 8) {
      setMsg({ type: "error", text: "Password must be at least 8 characters." }); return
    }
    setLoading(true); setMsg(null)
    try {
      const res  = await fetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, currentPassword: current, newPassword: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to change password")
      setMsg({ type: "success", text: "Password changed successfully." })
      setCurrent(""); setNext(""); setConfirm("")
      if (forced) {
        // The server re-signed the session cookie with the forced-change claim
        // cleared, so a full reload lands on an open dashboard.
        window.location.href = "/dashboard"
      }
    } catch (err: any) {
      setMsg({ type: "error", text: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {msg && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 18,
          background: msg.type === "success" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${msg.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          color:  msg.type === "success" ? "#16a34a" : "#dc2626",
          animation: "fadeIn 0.2s ease",
        }}>
          {msg.type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {msg.text}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
        <PasswordField
          label="Current Password"
          value={current} show={showCur}
          onToggle={() => setShowCur(p => !p)}
          onChange={setCurrent}
        />

        <div>
          <PasswordField
            label="New Password"
            value={next} show={showNew}
            onToggle={() => setShowNew(p => !p)}
            onChange={setNext}
          />
          {next && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{
                    flex: 1, height: 3, borderRadius: 99,
                    background: i <= strength ? strengthColor : "#e2e8f0",
                    transition: "background 0.2s",
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor }}>
                {strengthLabel}
              </span>
            </div>
          )}
        </div>

        <div>
          <PasswordField
            label="Confirm New Password"
            value={confirm} show={showCon}
            onToggle={() => setShowCon(p => !p)}
            onChange={setConfirm}
            errorBorder={!!(confirm && confirm !== next)}
          />
          {confirm && confirm !== next && (
            <p style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
              Passwords do not match
            </p>
          )}
        </div>
      </div>

      <div style={{
        marginTop: 14, padding: "10px 14px",
        background: "#f8fafc",
        borderWidth: "1px", borderStyle: "solid", borderColor: "#e2e8f0",
        borderRadius: 8, fontSize: 12, color: "#64748b",
      }}>
        At least <strong>8 characters</strong>. Best security: uppercase, numbers, and symbols.
      </div>

      <div style={{ marginTop: 20, borderTop: "1px solid #f1f5f9", paddingTop: 18 }}>
        <button
          onClick={handleChange} disabled={loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 20px", borderRadius: 7, fontSize: 13, fontWeight: 600,
            background: loading ? "#fca5a5" : "#dc2626",
            color: "#fff", border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.15s",
            boxShadow: "0 2px 8px rgba(220,38,38,0.2)",
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = "#b91c1c" }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = "#dc2626" }}
        >
          {loading
            ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Updating…</>
            : <><ShieldCheck size={14} /> Update Password</>
          }
        </button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin    { to { transform:rotate(360deg) } }
      `}</style>
    </div>
  )
}
