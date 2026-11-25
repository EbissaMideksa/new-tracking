// app/change-password/page.tsx
//
// Forced password change. Reached when an account signs in while still on the
// built-in default password (lib/defaultPassword.ts), or after a SUPER_ADMIN
// reset that account onto it.
//
// It lives OUTSIDE /dashboard deliberately: no sidebar/topbar shell, and no
// permission lookups — while the change is pending this account may do exactly
// one thing (PATCH /api/settings/password), because proxy.ts 403s every other
// API. Signing out stays available so nobody is trapped on this screen.
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { mustChangeOnFirstLogin } from "@/lib/defaultPassword"
import ChangePasswordForm from "@/components/settings/ChangePasswordForm"
import LogoutButton from "@/components/LogoutButton"
import { KeyRound, ShieldAlert } from "lucide-react"

export default async function ChangePasswordPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  // Nothing pending (an ordinary change from Settings) → don't stand in the way.
  // SUPER_ADMIN is never pending, so it is always redirected to the dashboard.
  const pending = user.mustChangePassword && mustChangeOnFirstLogin(user.role)
  if (!pending) redirect("/dashboard")

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f1f5f9",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "clamp(16px, 5vw, 48px) 16px",
    }}>
      <div style={{
        width: "100%", maxWidth: 560,
        background: "#fff", borderRadius: 12,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #f1f5f9",
          background: "#fafbfc",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: "#eff6ff",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#2563eb", flexShrink: 0,
          }}>
            <KeyRound size={17} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: 0 }}>
              Choose your own password
            </p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              {user.name} · {user.email}
            </p>
          </div>
        </div>

        {/* ── Why the app is closed ───────────────────────────────────────── */}
        <div style={{
          margin: "20px 24px 0",
          padding: "12px 14px",
          borderRadius: 8,
          background: "#fffbeb",
          borderWidth: "1px", borderStyle: "solid", borderColor: "#fde68a",
          color: "#92400e",
          fontSize: 12,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            This account is still on the <strong>default password</strong>, so the rest of
            the application is locked until you change it. Your current password is the
            default one you were given; pick something only you know.
          </span>
        </div>

        {/* ── Form ────────────────────────────────────────────────────────── */}
        <div style={{ padding: 24 }}>
          <ChangePasswordForm userId={user.id} forced />
        </div>

        {/* ── Escape hatch ────────────────────────────────────────────────── */}
        <div style={{
          padding: "14px 24px",
          borderTop: "1px solid #f1f5f9",
          background: "#fafbfc",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Not the account owner, or need help? Contact your system administrator.
          </span>
          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
