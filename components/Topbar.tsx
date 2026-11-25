// components/Topbar.tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { LogOut } from "lucide-react"
import { Home, Settings, CalendarClock } from "lucide-react"
import { useLiveChannel } from "@/hooks/useLiveChannel"
import { usePermissions } from "@/context/PermissionsContext"
import ThemeToggle from "./ThemeToggle"
import EthioTelecomLogo from "./EthioTelecomLogo"
import NotificationBell from "./NotificationBell"
import GlobalSearch from "./GlobalSearch"
import ClockChip from "./ClockChip"
import LogoutButton from "./LogoutButton"
import Modal from "./Modal"

export default function Topbar({ user, onMenuClick }: any) {
  const [liveUser, setLiveUser] = useState(user)
  const [siteName, setSiteName] = useState("Asset System")
  const pathname  = usePathname()
  const { canSelf, loading: matrixLoading } = usePermissions()
  const orgLabel  = buildOrgLabel(liveUser?.orgUnit)

  useEffect(() => {
    fetch("/api/settings/theme").then(r => r.json()).then(d => {
      if (d.siteName) setSiteName(d.siteName)
    }).catch(() => {})
  }, [])

  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [photoLightbox, setPhotoLightbox] = useState(false)
  const [avatarBroken, setAvatarBroken] = useState(false)
  // Date & time chip — off by default, toggled from the topbar.
  const [showClock, setShowClock] = useState(false)

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<any>).detail
      setLiveUser((prev: any) => ({ ...prev, ...detail }))
    }
    window.addEventListener("user:updated", handler)
    return () => window.removeEventListener("user:updated", handler)
  }, [])

  const isSettings = pathname.startsWith("/dashboard/settings")
  // The workorders page owns the full viewport (its own topbar + sidebar).
  const isWorkorders = pathname.startsWith("/dashboard/workorders")

  useLiveChannel<{ type: string; name?: string; photo?: string | null }>(
    "/api/events/user",
    (payload) => {
      if (payload.type === "PROFILE_UPDATED") {
        setLiveUser((prev: any) => ({ ...prev, ...payload }))
      }
    },
    // Topbar renders null on the workorders route — don't hold a wasted SSE
    // connection there (it counts toward the per-origin HTTP/1.1 limit and
    // contributed to stalling the workorders monitoring fetch).
    !isWorkorders
  )

  if (isWorkorders) return null

  const iconBtn = (active: boolean) =>
    [
      "flex items-center justify-center w-[34px] h-[34px] rounded-lg transition-colors no-underline",
      active
        ? "text-blue-600 bg-blue-50 border border-blue-200"
        : "text-slate-400 bg-transparent border border-transparent hover:bg-slate-100 hover:text-slate-600",
    ].join(" ")

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    window.location.href = "/login"
  }

  return (
    <div className="flex justify-between items-center gap-2 px-3 sm:px-4 border-b bg-white h-14 shrink-0 overflow-x-hidden min-w-0">
      {/* LEFT — mobile menu + ethio telecom logo */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuClick}
          title="Menu"
          aria-label="Open navigation"
          className="flex md:hidden items-center justify-center w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <EthioTelecomLogo />
      </div>

      <div className="hidden md:flex items-center gap-6">
        <h1 className="font-bold text-gray-800 text-sm truncate max-w-[200px]">{siteName}</h1>
        <Link href="/dashboard"            className="text-sm text-gray-600 hover:text-blue-600">Dashboard</Link>
        {!matrixLoading && liveUser?.role && canSelf( "view_work_orders") && (
          <Link href="/dashboard/workorders" className="text-sm text-gray-600 hover:text-blue-600">Work Orders</Link>
        )}
      </div>

      {/* GLOBAL SEARCH */}
      <div className="hidden md:block flex-1 max-w-md mx-4">
        <GlobalSearch />
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">

        {orgLabel && <p className="text-xs text-gray-400 hidden lg:block truncate max-w-[220px]">{orgLabel}</p>}

        <div className="h-8 w-px bg-gray-200 hidden sm:block shrink-0" />

        <div className="flex items-center gap-0.5">
          <Link href="/dashboard" title="Dashboard" className={iconBtn(!isSettings)}>
            <Home size={16} />
          </Link>
          <Link href="/dashboard/settings" title="Settings" className={iconBtn(isSettings)}>
            <Settings size={16} />
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setShowClock(v => !v)}
            title={showClock ? "Hide date & time" : "Show date & time"}
            aria-label="Show date and time"
            aria-pressed={showClock}
            className={[
              "flex items-center justify-center w-[34px] h-[34px] rounded-lg cursor-pointer transition-colors",
              showClock
                ? "text-blue-600 bg-blue-50 border border-blue-200"
                : "text-slate-400 bg-transparent border border-transparent hover:bg-slate-100 hover:text-slate-600",
            ].join(" ")}
          >
            <CalendarClock size={16} />
          </button>
          <NotificationBell />
          {showClock && <ClockChip />}
        </div>

        <div className="h-8 w-px bg-gray-200 hidden sm:block shrink-0" />

        {/* Avatar + name */}
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1 cursor-pointer transition-colors hover:bg-slate-50 min-w-0">
          <div
            onClick={() => (liveUser?.photo && !avatarBroken) ? setPhotoLightbox(true) : setShowLogoutModal(true)}
            title={liveUser?.photo ? "Click to enlarge" : "Account"}
            className="h-8 w-8 rounded-full overflow-hidden shrink-0 bg-blue-50 border-[1.5px] border-blue-200 flex items-center justify-center transition-all"
          >
            {liveUser?.photo && !avatarBroken
              ? <img src={liveUser.photo} alt={liveUser.name} className="h-full w-full object-cover" onError={() => setAvatarBroken(true)} />
              : <span className="text-[11px] font-bold text-blue-600">{getInitials(liveUser?.name ?? "")}</span>
            }
          </div>
          <div className="hidden sm:block text-right leading-tight min-w-0" onClick={() => setShowLogoutModal(true)}>
            <p className="text-sm font-semibold text-gray-800 truncate max-w-[140px]">{liveUser?.name}</p>
            <p className="text-xs font-medium truncate" style={{ color: getRoleColor(liveUser?.role) }}>{liveUser?.role}</p>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="bg-transparent border-0 text-slate-400 hover:text-red-600 cursor-pointer flex items-center p-1"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {showLogoutModal && (
        <Modal
          open={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          title="Account"
          size="sm"
          footer={
            <button
              onClick={() => setShowLogoutModal(false)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white cursor-pointer hover:bg-slate-50"
            >
              Cancel
            </button>
          }
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-[60px] w-[60px] rounded-full overflow-hidden bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
              {liveUser?.photo ? (
                <img src={liveUser.photo} alt={liveUser.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-bold text-blue-600">
                  {getInitials(liveUser?.name ?? "")}
                </span>
              )}
            </div>

            <div className="text-center min-w-0">
              <div className="font-semibold text-gray-900 truncate max-w-[260px]">{liveUser?.name}</div>
              <div className="text-[13px]" style={{ color: getRoleColor(liveUser?.role) }}>
                {liveUser?.role}
              </div>
            </div>

            <div className="w-full mt-2 cursor-pointer">
              <LogoutButton />
            </div>
          </div>
        </Modal>
      )}
      {/* ── PHOTO LIGHTBOX ── */}
      {photoLightbox && liveUser?.photo && (
        <div
          onClick={() => setPhotoLightbox(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer p-6"
        >
          <img
            src={liveUser.photo}
            alt={liveUser.name}
            onClick={e => e.stopPropagation()}
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-cover shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}


/* ── helpers ── */
function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?"
}
function getRoleColor(role?: string) {
  const map: Record<string, string> = {
    SUPER_ADMIN: "#7c3aed", ADMIN: "#2563eb", CHIEF: "#0891b2",
    DIRECTOR: "#059669", MANAGER: "#d97706", SUPERVISOR: "#ea580c", USER: "#6b7280",
  }
  return map[role ?? ""] ?? "#6b7280"
}

function buildOrgLabel(orgUnit: any): string {
  if (!orgUnit) return ""
  const chain: any[] = []
  let node = orgUnit
  while (node) { chain.push(node); node = node.parent }
  const getByType = (type: string) => chain.find((n: any) => n.type?.toUpperCase() === type.toUpperCase())
  const current     = chain[0]
  const division    = getByType("DIVISION")
  const department  = getByType("DEPARTMENT")
  const zoneRegion  = chain.find((n: any) => ["ZONE","REGION"].includes(n.type?.toUpperCase()))
  const currentType = current?.type?.toUpperCase()
  if (currentType === "COUNTRY")    return current.name
  if (currentType === "DIVISION")   return abbreviate(current.name)
  if (currentType === "DEPARTMENT") return division ? `${current.name} · ${abbreviate(division.name)}` : current.name
  if (currentType === "ZONE" || currentType === "REGION") { const a = buildAncestry(division, department); return a ? `${current.name} , ${a}` : current.name }
  if (currentType === "SECTION")    { const label = stripSuffix(current.name, " Section"); const corporate = getByType("CORPORATE"); const a = buildAncestry(division, department, corporate); return a ? `${label} , ${a}` : label }
  if (currentType === "AREA")       { const a = buildAncestry(division, department, zoneRegion); return a ? `${current.name} Area, ${a}` : current.name }
  if (currentType === "SITE")       { const area = getByType("AREA"); const a = buildAncestry(division, department, zoneRegion); const prefix = area ? area.name : stripSuffix(current.name, / Group-\d+$/); return a ? `${prefix}, ${a}` : prefix }
  if (currentType === "GROUP")      { const section = getByType("SECTION"); const corporate = getByType("CORPORATE"); const a = buildAncestry(division, department, corporate, section); return a ? `${current.name}, ${a}` : current.name }
  return current.name
}
function buildAncestry(division?: any, department?: any, corporate?: any, section?: any) {
  const parts: string[] = []
  if (section) parts.push(section.name)
  if (corporate) parts.push(corporate.name)
  if (division)   parts.push(abbreviate(division.name))
  if (department) parts.push(abbreviate(department.name))
  return parts.join("  ")
}
function abbreviate(name: string) {
  const words = name.trim().split(/\s+/)
  return words.length === 1 ? name : words.map((w: string) => w[0].toUpperCase()).join("")
}
function stripSuffix(name: string, suffix: string | RegExp) {
  return typeof suffix === "string" ? name.replace(new RegExp(`${suffix}$`), "").trim() : name.replace(suffix, "").trim()
}