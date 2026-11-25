
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import PersonalInfoForm from "@/components/settings/PersonalInfoForm"
import ChangePasswordForm from "@/components/settings/ChangePasswordForm"
import { User, Lock, ChevronRight } from "lucide-react"

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const safeUser = {
    id:    user.id,
    name:  user.name  ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    photo: (user as any).photo ?? null,
    orgUnit: user.orgUnit ? { name: user.orgUnit.name, type: user.orgUnit.type } : null,
    role:  user.role,
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f1f5f9",
      padding: "clamp(12px, 5vw, 24px)",
      display: "flex",
      flexDirection: "column",
    }}>
      <style>{`
        /* Responsive grid for settings cards */
        @media (max-width: 767px) {
          .settings-grid { max-width: 100% !important; }
          .settings-card { border-radius: 10px !important; }
          .settings-card-header { padding: 14px 14px !important; gap: 10px !important; }
          .settings-card-body { padding: 16px !important; }
          .settings-title { font-size: 16px !important; }
          .settings-subtitle { font-size: 11px !important; }
          .page-header { margin-bottom: 16px !important; }
          .page-title { font-size: 20px !important; }
          .page-subtitle { margin-top: 2px !important; font-size: 12px !important; }
        }
      `}</style>

      {/* ── PAGE HEADER ── */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, color: "#94a3b8", marginBottom: 6,
          flexWrap: "wrap",
        }}>
          <span>Dashboard</span>
          <ChevronRight size={12} />
          <span style={{ color: "#475569", fontWeight: 500 }}>Settings</span>
        </div>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Account Settings
        </h1>
        <p className="page-subtitle" style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Manage your profile and security preferences
        </p>
      </div>

      {/* ── CARDS GRID ── */}
      <div className="settings-grid" style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860 }}>

        {/* ── PERSONAL INFORMATION ── */}
        <div className="settings-card" style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          {/* Card header */}
          <div className="settings-card-header" style={{
            padding: "16px 24px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex", alignItems: "center", gap: 12,
            background: "#fafbfc",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: "#eff6ff",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#2563eb", flexShrink: 0,
            }}>
              <User size={17} />
            </div>
            <div>
              <p className="settings-title" style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: 0 }}>
                Personal Information
              </p>
              <p className="settings-subtitle" style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                Update your name, phone number, and profile photo
              </p>
            </div>
          </div>

          {/* Card body */}
          <div className="settings-card-body" style={{ padding: "24px" }}>
            <PersonalInfoForm user={safeUser} />
          </div>
        </div>

        {/* ── CHANGE PASSWORD ── */}
        <div className="settings-card" style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div className="settings-card-header" style={{
            padding: "16px 24px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex", alignItems: "center", gap: 12,
            background: "#fafbfc",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: "#fef2f2",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#dc2626", flexShrink: 0,
            }}>
              <Lock size={17} />
            </div>
            <div>
              <p className="settings-title" style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: 0 }}>
                Change Password
              </p>
              <p className="settings-subtitle" style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                Update your login password
              </p>
            </div>
          </div>

          <div className="settings-card-body" style={{ padding: "24px" }}>
            <ChangePasswordForm userId={user.id} />
          </div>
        </div>

      </div>
    </div>
  )
}
