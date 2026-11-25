 // app/dashboard/users/_components/userColumns.tsx
//
// Column model for the Users table, plus the values that are DERIVED rather
// than stored: Section, Region/Zone/Site. Keeping both here means the table,
// the detail drawer and the mobile expandable row can never disagree about
// what a column means.

// ── Row shape ────────────────────────────────────────────────────────────────
// Mirrors lib/userSelect.ts — the one shape every /api/users response carries.

export type User = {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  createdAt?: string

  /** true → account is still on the built-in default password. */
  mustChangePassword?: boolean

  /** Oracle ID (the employee number an admin cross-references). */
  employeeId?: string | null
  jobTitle?: string | null

  /** ACTIVE | SUSPENDED | INACTIVE — enforced at sign-in. */
  status?: string
  lastLoginAt?: string | null
  managerId?: string | null
  manager?: { id: string; name: string; role?: string } | null

  /** Where the user SITS in the hierarchy. */
  orgUnit?: { id: string; name: string; type: string; path?: string }

  /**
   * Second affiliation of the matrix: the department a field worker belongs to
   * (null for everyone who sits in the corporate hierarchy itself).
   */
  department?: { id: string; name: string; path: string } | null

  /** assignedAssets + work orders still in flight. */
  _count?: { assignedAssets: number; assignedWorkOrders: number }
}

// ── Org-tree helpers ─────────────────────────────────────────────────────────

export type OrgNode = {
  id: string
  name: string
  type: string
  children?: OrgNode[]
}

/**
 * id → [root … node] for every node of the tree. The tree handed down by
 * useTree() carries id/name/type/children only (no path), so ancestry has to
 * be captured while walking. A user outside the visible subtree simply has no
 * entry and falls back to the path-based derivations.
 */
export function buildAncestry(
  tree: OrgNode | null | undefined,
): Map<string, OrgNode[]> {
  const map = new Map<string, OrgNode[]>()
  if (!tree) return map

  const walk = (n: OrgNode, chain: OrgNode[]) => {
    const next = [...chain, n]
    map.set(n.id, next)
    for (const c of n.children ?? []) walk(c, next)
  }

  walk(tree, [])
  return map
}

// Division abbreviation, from either a slug path ("ethiopia/fixed-network/o&m")
// or a display name ("Fixed Network").

const DIV_ABBRS: [RegExp, string][] = [
  [/fixed[-\s]network/i, "FN"],
  [/wireless[-\s]network/i, "WN"],
  [/network[-\s]infrastructure/i, "NI"],
]

export function divisionAbbr(src?: string | null): string {
  if (!src) return ""
  for (const [re, abbr] of DIV_ABBRS) {
    if (re.test(src)) return abbr
  }
  return ""
}

/**
 * Org tiers at DEPARTMENT level and above carry NO section — a department
 * director, a division chief, a country admin and the headless grouping tiers
 * (Deputy CEO Office, Zones/Regions category) all sit at or above the
 * department, where the corporate "Section" tier does not exist. Everything
 * strictly below a department — the corporate Corporate→Section→Group arm and
 * the field arm — still resolves a section.
 */
const NO_SECTION_TYPES = new Set([
  "COUNTRY",
  "DIVISION",
  "DEPARTMENT",
  "DEPUTY_CEO_OFFICE",
  "CATEGORY",
])

/**
 * Section — the org tree runs deeper than Department, so this is the tier an
 * admin actually scopes by. Derived, never stored:
 *
 *   department level and above → "—" (no section exists there)
 *   corporate arm → the SECTION node in the chain ("FN O&M HQ")
 *   field arm     → zone/region + division + department → "CWR FN O&M", which
 *                   is exactly how the org structure names the equivalent node
 *
 * Returns "—" when the chain carries no section information at all.
 */
// Roles at or above DIRECTOR do not have a Section — it is not applicable to
// directors, chiefs, admins and super-admins.
const SECTION_NA_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "CHIEF", "DIRECTOR"])

export function sectionFor(u: User, chain?: OrgNode[]): string {
  // Section does not apply to directors and above (and admins / super-admins).
  if (SECTION_NA_ROLES.has(String(u.role))) return "—"

  const ownType = String(
    u.orgUnit?.type ?? chain?.[chain.length - 1]?.type ?? "",
  ).toUpperCase()

  const dept = u.department
  const div =
    divisionAbbr(dept?.path) ||
    divisionAbbr(chain?.find((n) => n.type === "DIVISION")?.name)

  // Zone/region abbreviation — from the org chain (legacy field arm) or from
  // the worker's operational zone (new model: orgUnit is the functional unit,
  // the zone/region lives on User.geoZone).
  const zoneNode = chain?.find((n) => n.type === "ZONE" || n.type === "REGION")
  const geoZone = (u as any).geoZone
  const zoneAbbr =
    (zoneNode as any)?.code || zoneNode?.name || geoZone?.code || geoZone?.name

  // A zones/regions (field) worker always resolves to "<zone> <Div> <Dep>" —
  // pulling its ancestors — even though their org unit is the functional
  // department and carries no SECTION tier of its own.
  if (zoneAbbr) {
    const deptName =
      dept?.name ?? chain?.find((n) => n.type === "DEPARTMENT")?.name
    return [zoneAbbr, div, deptName].filter(Boolean).join(" ") || "—"
  }

  // Corporate arm → the SECTION node itself.
  const section = chain?.find((n) => n.type === "SECTION")
  if (section) return section.name

  // Department level and above → no section.
  if (NO_SECTION_TYPES.has(ownType)) return "—"

  if (dept?.name) return [div, dept.name].filter(Boolean).join(" ")
  if (zoneNode) return zoneNode.name

  return "—"
}

/**
 * Department — the work unit a user BELONGS to, prefixed with its division
 * abbreviation so a bare department name is unambiguous across the three
 * divisions (every division has an "O&M", "Planning" and "Engineering"):
 *
 *   "NI Engineering", "FN O&M", "WN Planning"
 *
 * Derived, never stored:
 *   • department affiliation (User.department.path) — the field worker's work
 *     unit, or a corporate worker's own department.
 *   • fallback: the DEPARTMENT node in the chain (for a department director,
 *     whose org unit IS the department), with the division from the chain.
 *
 * Returns "—" when the user belongs to no department at all (a division chief,
 * a country admin, an operational director on the field arm).
 */
export function departmentFor(u: User, chain?: OrgNode[]): string {
  const dept = u.department
  const deptNode = chain?.find((n) => n.type === "DEPARTMENT")
  const div =
    divisionAbbr(dept?.path) ||
    divisionAbbr(chain?.find((n) => n.type === "DIVISION")?.name)

  if (dept?.name) return [div, dept.name].filter(Boolean).join(" ")
  if (deptNode) return [div, deptNode.name].filter(Boolean).join(" ")
  return "—"
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—"

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "Never"

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Never"

  return `${fmtDate(iso)}, ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return "never signed in"

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "never signed in"

  const mins = Math.floor((Date.now() - d.getTime()) / 60_000)

  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  return fmtDate(iso)
}

// ── Status chips ─────────────────────────────────────────────────────────────

export const STATUS_STYLES: Record<
  string,
  { bg: string; fg: string; bd: string }
> = {
  ACTIVE: { bg: "#dcfce7", fg: "#166534", bd: "#bbf7d0" },
  SUSPENDED: { bg: "#fee2e2", fg: "#991b1b", bd: "#fecaca" },
  INACTIVE: { bg: "#f1f5f9", fg: "#475569", bd: "#e2e8f0" },
}

/** A row that predates the field (or a partial SSE payload) reads as ACTIVE. */
export function statusOf(u: User): string {
  const s = u.status ?? "ACTIVE"
  return ["ACTIVE", "SUSPENDED", "INACTIVE"].includes(s) ? s : "ACTIVE"
}

// ── Columns ──────────────────────────────────────────────────────────────────

export type ColKey =
  | "name"
  | "email"
  | "phone"
  | "role"
  | "status"
  | "orgUnit"
  | "department"
  | "section"
  | "regionZoneSite"
  | "manager"
  | "employeeId"
  | "jobTitle"
  | "assignedAssets"
  | "openWorkOrders"
  | "lastLogin"
  | "createdAt"

export type ColDef = {
  key: ColKey
  label: string

  /** Shown in the collapsed mobile row (Name + Role + Status); the rest go
   * into the expandable row. */
  mobile?: boolean

  /** Shown by default; the rest sit behind the column-visibility toggle. */
  on: boolean
}

/**
 * Display order — `section` sits directly after `department`, which is the
 * point of the column: the org tree runs deeper than Department.
 *
 * The defaults keep the table to what was asked for (10 columns). Email,
 * phone, Region/Zone/Site, Reports To, Open Work Orders and Created are one
 * click away in the toggle and are always present in the detail drawer, so
 * the table never turns into a horizontal-scroll hunt.
 */
export const COLUMNS: ColDef[] = [
  { key: "name", label: "Name", mobile: true, on: true },
  { key: "role", label: "Role", mobile: true, on: true },
  { key: "status", label: "Status", mobile: true, on: true },
  { key: "orgUnit", label: "Org Unit", on: true },
  { key: "department", label: "Department", on: true },
  { key: "section", label: "Section", on: true },
  { key: "employeeId", label: "Oracle ID", on: true },
  { key: "jobTitle", label: "Job Title", on: true },
  { key: "assignedAssets", label: "Assigned Assets", on: true },
  { key: "lastLogin", label: "Last Login", on: true },
  { key: "email", label: "Email", on: false },
  { key: "phone", label: "Phone", on: false },
  { key: "regionZoneSite", label: "Region / Zone / Site", on: false },
  { key: "manager", label: "Reports To", on: false },
  { key: "openWorkOrders", label: "Open Work Orders", on: false },
  { key: "createdAt", label: "Created", on: false },
]

export type Visibility = Record<ColKey, boolean>

export function defaultVisibility(): Visibility {
  return Object.fromEntries(
    COLUMNS.map((c) => [c.key, c.on]),
  ) as Visibility
}

const STORAGE_KEY = "dashboard:users:visibleColumns"

/** Saved column choices — read in an effect (storage is client-only). */
export function loadVisibility(): Visibility {
  const base = defaultVisibility()

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base

    const saved = JSON.parse(raw) as Record<string, unknown>

    // Merge over the defaults so a column added later still shows up.
    for (const col of COLUMNS) {
      if (typeof saved[col.key] === "boolean") {
        base[col.key] = saved[col.key] as boolean
      }
    }
  } catch {
    /* corrupt value → keep the defaults */
  }

  return base
}

export function saveVisibility(v: Visibility): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    /* private mode */
  }
}

/**
 * Region / Zone / Site — the physical location a field worker is scoped to
 * (derived from the chain captured by buildAncestry()).
 */
export function regionZoneSiteFor(chain?: OrgNode[]): string {
  if (!chain?.length) return "—"

  const zone = chain.find(
    (n) => n.type === "ZONE" || n.type === "REGION",
  )
  const area = chain.find((n) => n.type === "AREA")
  const site = chain.find((n) => n.type === "SITE")

  const parts = [zone?.name, area?.name, site?.name].filter(Boolean) as string[]

  return parts.length ? parts.join(" / ") : "—"
}
