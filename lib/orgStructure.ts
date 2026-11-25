// lib/orgStructure.ts
//
// Single source of truth for the SHAPE of the organizational tree.
//
// Everything that used to hard-code "SECTION" in seven different places (the
// assign/upload/bulk/workorder routes, the dashboard, UploadPro, the fallback
// role map) reads from here instead, so changing the hierarchy is one edit.
//
// This module must stay dependency-free (no Prisma, no "use client") — it is
// imported by both route handlers and browser components.
//
// ── The hierarchy ────────────────────────────────────────────────────────────
//
//   COUNTRY      Ethiopia
//   ├─ DEPUTY_CEO_OFFICE   Deputy CEO Office   ← the OPERATIONAL DIRECTOR'S OFFICE
//   │  └─ CATEGORY        "Zones" | "Regions"      ← grouping tier
//   │     ├─ ZONE            EAAZ / NAAZ / SAAZ / SWAAZ / WAAZ   (one DIRECTOR each)
//   │     │  └─ AREA          Bole / Sidist Kilo / …
//   │     │     └─ SITE        "<area> Group-1" / "…-2"
//   │     └─ REGION          CWR / WR / SWR / SER / WWR / …     (one DIRECTOR each)
//   │        └─ AREA          …
//   │           └─ SITE        …
//   └─ DIVISION      Fixed Network / Wireless Network / Network Infrastructure
//      └─ DEPARTMENT     O&M / Planning / Engineering      ← corporate office
//         ├─ CATEGORY        "Zones" | "Regions"          ← grouping tier (per depts)
//         │  ├─ ZONE            EAAZ / NAAZ / SAAZ / SWAAZ / WAAZ
//         │  │  └─ AREA          Bole / Sidist Kilo / …
//         │  │     └─ SITE        "<area> Group-1" / "…-2"
//         │  └─ REGION          CWR / WR / SER / WWR / …
//         │     └─ AREA          …
//         │        └─ SITE        …
//         └─ CORPORATE       "Corporate HQ" / "Corporate Support"
//            └─ SECTION       "FN Transmission Engineering"
//               └─ GROUP      "Transmission Engineering 1"
//
// The Zones/Regions field arm exists under BOTH the Deputy CEO Office AND each
// department — every department gets its own "Zones"/"Regions" categories with
// the same field units (EAAZ, NAAZ, …, SER, SWR, …), IN ADDITION TO the copy
// under the Deputy CEO Office. This is structural only: it shows which zones/
// regions a department operates in.
//
// What is NOT repeated per department is the HEAD. A zone/region carries exactly
// ONE operational DIRECTOR, and that account lives ONCE under the Deputy CEO
// Office (the operational director's office) — never a "CWR Operational
// Director" under "Fixed Network O&M". A department has only its single
// DEPARTMENT director.
//
// Two affiliations, one person (the matrix):
//
//   • A field worker SITS on an area/site of the deputy-CEO field arm
//     (User.orgUnitId) AND BELONGS to a department (User.departmentId — their
//     work unit). The department keeps its people without nesting them under it.
//   • A corporate worker SITS on the department's corporate branch
//     (Corporate → Section → Group) and BELONGS to that same department
//     (User.departmentId). They have no field-arm affiliation.
//
// Under Corporate: Section → Group. A group is a leaf — users sit on it.
// A section may also go directly to users when no group tier is configured.
// The section name already carries the division and department (e.g.
// "FN Transmission Engineering"), so the word "Section" is never written
// as a suffix.
//
// A SECTION or GROUP is never written as "… Section" / "… Group" in a name —
// the name already carries all the context, and the tier is implied by being
// under a zone/region (SECTION) or section (GROUP).

export type OrgTypeName =
  | "COUNTRY"
  | "DIVISION"
  | "DEPARTMENT"
  | "DEPUTY_CEO_OFFICE"
  | "CATEGORY"
  | "CORPORATE"
  | "REGION"
  | "ZONE"
  | "SECTION"
  | "GROUP"
  | "AREA"
  | "SITE"

export const ORG_TYPES: OrgTypeName[] = [
  "COUNTRY", "DIVISION", "DEPARTMENT", "DEPUTY_CEO_OFFICE", "CATEGORY", "CORPORATE",
  "REGION", "ZONE", "SECTION", "GROUP", "AREA", "SITE",
]

/**
 * Display label for a type. Used by badges/trees where the raw enum would read
 * as implementation detail — CATEGORY in particular has no obvious spoken form,
 * and the org-structure editor needs to say what a node is in plain words.
 */
export const ORG_TYPE_LABEL: Record<OrgTypeName, string> = {
  COUNTRY:    "Country",
  DIVISION:   "Division",
  DEPARTMENT: "Department",
  DEPUTY_CEO_OFFICE: "Deputy CEO Office",
  CATEGORY:   "Zones / Regions",
  CORPORATE:  "Corporate",
  REGION:     "Region",
  ZONE:       "Zone",
  SECTION:    "Section",
  GROUP:      "Group",
  AREA:       "Area",
  SITE:       "Site",
}

/**
 * One colour per type, shared by the dashboard cards, the org-structure modal
 * and the admin editor so a unit never changes colour between screens.
 * SECTION reuses ZONE/REGION's indigo family to signal "same tier, one down";
 * CATEGORY gets teal so the new grouping tier is visually distinct.
 */
export const ORG_TYPE_COLOR: Record<OrgTypeName, string> = {
  COUNTRY:    "#0f172a",
  DIVISION:   "#6366f1",
  DEPARTMENT: "#0ea5e9",
  // Rose — the deputy CEO office is a staff office, deliberately outside the
  // indigo/blue corporate chain that owns everything else.
  DEPUTY_CEO_OFFICE: "#e11d48",
  CATEGORY:   "#14b8a6",
  CORPORATE:  "#0f172a",
  REGION:     "#8b5cf6",
  ZONE:       "#8b5cf6",
  SECTION:    "#10b981",
  GROUP:      "#f59e0b",
  AREA:       "#f59e0b",
  SITE:       "#64748b",
}

/**
 * Parent → allowed children. This is the contract the API enforces on create
 * and the admin editor uses to decide which types to offer, so an admin cannot
 * accidentally build a tree the rest of the app cannot interpret.
 *
 * Deliberately strict: every entry below has a consumer (the role→target map,
 * the political-area resolver, the label builders) that assumes exactly this
 * chain. Loosening it silently breaks assignment, reporting or both.
 */
export const ORG_CHILD_TYPES: Record<OrgTypeName, OrgTypeName[]> = {
  COUNTRY:    ["DIVISION", "DEPUTY_CEO_OFFICE"],
  DIVISION:   ["DEPARTMENT"],
  // A department carries BOTH arms (see the tree above): its own field
  // categories — the same "Zones"/"Regions" the Deputy CEO Office carries,
  // mirrored per department (structural; NO head account under them — the
  // operational directors live ONCE under the Deputy CEO Office) — and the
  // CORPORATE chain.
  //
  // A SECTION may also hang DIRECTLY off the department (the corporate-only
  // wing): Department → Section → (Groups | workers under the section manager).
  // The CORPORATE grouping node is kept for backwards compatibility.
  DEPARTMENT: ["CATEGORY", "CORPORATE", "SECTION"],
  DEPUTY_CEO_OFFICE: ["CATEGORY"],
  // Both categories are interchangeable: "Zones" holds the zones and
  // "Regions" holds the regions, but nothing keys off the CATEGORY name.
  // CATEGORY name.
  CATEGORY:   ["ZONE", "REGION"],
  CORPORATE:  ["SECTION"],
  REGION:     ["AREA"],
  ZONE:       ["AREA"],
  SECTION:    ["GROUP"],
  GROUP:      [],
  AREA:       ["SITE"],
  SITE:       [],
}

/** Children a unit of this type may have — `[]` means leaf. */
export function allowedChildTypes(parentType: string): OrgTypeName[] {
  return ORG_CHILD_TYPES[(parentType as OrgTypeName).toUpperCase() as OrgTypeName] ?? []
}

/**
 * Role → the org-unit types that role may assign assets / work orders TO.
 *
 * Kept as an array because the tiers the roles straddle widened once both the
 * category and section tiers existed: a department DIRECTOR has to reach zones
 * and regions, while an operational DIRECTOR sitting on a zone reaches the
 * sections under it.
 *
 * The types a role may ACTUALLY touch is still bounded by its org path
 * (lib/rbac.ts `canAccess`) — this only narrows the tier.
 */
export const ROLE_TARGET_TYPES: Record<string, OrgTypeName[]> = {
  CHIEF:      ["DIVISION"],
  DIRECTOR:   ["DEPARTMENT", "ZONE", "REGION"],
  MANAGER:    ["SECTION"],
  SUPERVISOR: ["AREA", "GROUP"],
}

/** Types this role may assign to — empty for roles that may not assign at all. */
export function targetTypesFor(role: string): OrgTypeName[] {
  return ROLE_TARGET_TYPES[String(role ?? "").toUpperCase()] ?? []
}

/** Does this role have a tier at all? Guards the "cannot assign" 403s. */
export function canAssignTargets(role: string): boolean {
  return targetTypesFor(role).length > 0
}

/** Is `type` one this role may receive an asset/work order on? */
export function roleCanTarget(role: string, type: string): boolean {
  return targetTypesFor(role).includes(String(type ?? "").toUpperCase() as OrgTypeName)
}

/** Tier list for the "CHIEF can only assign to DEPARTMENT units" style error. */
export function describeTargets(role: string): string {
  const t = targetTypesFor(role)
  return t.length > 1 ? t.join(", ") : (t[0] ?? "no tier")
}

/**
 * Tiers an asset, work order or account may be assigned ONTO — the list the
 * admin pickers filter the tree by.
 *
 * CATEGORY is deliberately absent: it is a pure grouping node ("Zones" /
 * "Regions") with no head and no political administration of its own, so an
 * asset parked on one would report no Area (Political Admin).
 */
export const ASSIGNABLE_TYPES: OrgTypeName[] = [
  "DIVISION", "DEPARTMENT", "CORPORATE", "ZONE", "REGION", "SECTION", "GROUP", "AREA", "SITE",
]

/**
 * Role implied by a unit's type when a user is created or re-homed without an
 * explicit role. Mirrors ROLE_TARGET_TYPES: the head of a tier gets the role
 * that manages the tier beneath it.
 *
 * ZONE/REGION → DIRECTOR because that is where the operational director sits;
 * SECTION → MANAGER because a manager runs the areas below the section.
 */
export function fallbackRoleForType(orgUnitType: string): string {
  switch (String(orgUnitType ?? "").toUpperCase()) {
    case "DIVISION":   return "CHIEF"
    case "DEPARTMENT": return "DIRECTOR"
    // The deputy CEO office is a grouping tier that carries nobody — nobody is
    // ever "the head" of it, so an account dropped on it stays a plain USER
    // rather than inheriting a management role from the tier.
    case "DEPUTY_CEO_OFFICE": return "USER"
    case "CATEGORY":
    case "CORPORATE":  return "MANAGER"
    case "ZONE":
    case "REGION":     return "DIRECTOR"
    case "SECTION":    return "MANAGER"
    case "GROUP":      return "SUPERVISOR"
    case "AREA":       return "SUPERVISOR"
    case "SITE":       return "USER"
    default:           return "USER"
  }
}

/** The types that carry a political administration (see lib/politicalArea.ts). */
export function isFieldUnitType(type: string): boolean {
  return ["ZONE", "REGION"].includes(String(type ?? "").toUpperCase())
}

/**
 * Name of the operational section for a zone/region — `EAAZ FN O&M`.
 *
 * Code first, then the initials of the division, then the department verbatim
 * ("O&M" is already an initialism, so it passes through untouched).
 * `divisionName` may be undefined when the caller has no division ancestor —
 * the zone code alone still reads unambiguously.
 */
export function buildSectionName(
  zoneOrRegionName: string,
  divisionName?: string | null,
  departmentName?: string | null,
): string {
  const parts = [String(zoneOrRegionName).trim()]
  if (divisionName?.trim()) parts.push(abbreviate(divisionName))
  if (departmentName?.trim()) parts.push(departmentName.trim())
  return parts.join(" ")
}

/** First letters of each word — "Fixed Network" → "FN". Single words pass through. */
export function abbreviate(name: string): string {
  const words = String(name).trim().split(/\s+/)
  return words.length === 1 ? words[0] : words.map(w => w[0].toUpperCase()).join("")
}

/** URL/path slug. Mirrors the inline computation in the org routes and seed. */
export function slugify(name: string): string {
  return String(name).toLowerCase().trim().replace(/\s+/g, "-")
}

/**
 * Colour for a type, with the grey fallback used across the app.
 * Takes `string` so callers can pass a unit's type straight off an API payload
 * without casting through OrgTypeName first.
 */
export function typeColor(type?: string): string {
  return ORG_TYPE_COLOR[String(type ?? "").toUpperCase() as OrgTypeName] ?? "#64748b"
}

/** Plain-words label for a type — SECTION reads as "Field Operations". */
export function typeLabel(type?: string): string {
  const t = String(type ?? "").toUpperCase() as OrgTypeName
  return ORG_TYPE_LABEL[t] ?? String(type ?? "")
}

/** May a unit of type `parentType` gain a child of type `childType`? */

/** Role rank for the departmentalization chain. CHIEF is the top of the
 * approval ladder (0); USER is the base (4). Used to derive Reports To:
 * a user's Reports To is the person one rank above them in this chain.
 */
export const ROLE_RANK: Record<string, number> = {
  CHIEF: 0,
  DIRECTOR: 1,
  MANAGER: 2,
  SUPERVISOR: 3,
  USER: 4,
}

/**
 * The single role one rank above `role` in the departmentalization chain.
 * CHIEF has no Reports To (returns null), which is correct — the chief is
 * accountable only to the Deputy CEO Office.
 */
export function reportsToRole(role: string): string | null {
  const r = String(role ?? "").toUpperCase()
  const rank = ROLE_RANK[r]
  if (rank === undefined) return null
  const parent = Object.entries(ROLE_RANK).find(([, r]) => r === rank - 1)?.[0]
  return parent ?? null
}

/** The full approval chain for a role, oldest → newest:
 *   SUPERVISOR → MANAGER → DIRECTOR → CHIEF
 */
export function reportingChain(role: string): string[] {
  const chain: string[] = []
  let current: string | null = String(role ?? "").toUpperCase()
  while (current) {
    chain.push(current)
    current = reportsToRole(current)
  }
  return chain
}
export function canHaveChild(parentType: string, childType: string): boolean {
  return allowedChildTypes(parentType).includes(childType.toUpperCase() as OrgTypeName)
}

/**
 * Department placement rule (design: corporate-only vs spreadable).
 *
 * A department is the functional home of its people. Two placements exist:
 *
 *   • SPREADABLE (the default, also what NULL means for rows created before
 *     this flag) — the department may branch into the field arm: it gains the
 *     "Zones" / "Regions" CATEGORY folders and, through them, its own local
 *     workforce units ("EAAZ FN O&M").
 *   • CORPORATE_ONLY — the department exists at the head office alone. The
 *     API refuses CATEGORY (and therefore ZONE/REGION/LOCAL_UNIT) children
 *     under it, so it can never acquire a field presence by accident.
 *
 * Enforced server-side in app/api/org/route.ts (legacy OrgUnit tree) and
 * lib/org/orgService.ts createLocalUnit (OrgNode tree); the hierarchy editor
 * mirrors it by hiding the Categories option for corporate-only departments.
 */
export const DEPARTMENT_PLACEMENTS = ["CORPORATE_ONLY", "SPREADABLE"] as const
export type DepartmentPlacement = (typeof DEPARTMENT_PLACEMENTS)[number]

/** Is this a valid placement value? Accepts any case; NULL/"" → false. */
export function isValidPlacement(value: unknown): value is DepartmentPlacement {
  return DEPARTMENT_PLACEMENTS.includes(String(value ?? "").toUpperCase() as DepartmentPlacement)
}

/**
 * May a department with this placement grow the field arm (Zones/Regions
 * categories, and everything below)? NULL is treated as SPREADABLE so every
 * department that existed before the flag was introduced keeps working.
 */
export function departmentCanSpread(placement?: string | null): boolean {
  return String(placement ?? "SPREADABLE").toUpperCase() !== "CORPORATE_ONLY"
}
