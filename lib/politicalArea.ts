
// lib/politicalArea.ts
//
// Single source of truth for an asset's "Area (Political Admin)".
//
// Deliberately pure (no Prisma, no "use client") so the same rules run in:
//   • the server, when deriving the value on upload/move, and
//   • the browser, when rendering the table and building exports.
//
// Previously the two sides disagreed: the browser resolved CORPORATE plus
// name-pattern matches, while the server only accepted type REGION/ZONE. The
// table and the Excel/CSV export therefore showed different areas for the same
// asset. Both now call resolvePoliticalArea() below.
//
// Resolution order (first match wins):
//   1. the CORPORATE ancestor — corporate scope overrides an operating region
//   2. the outermost REGION or ZONE ancestor — the political administration
//   3. the stored `code` on an ancestor (zones/regions are renamed by admins,
//      so the code column is the stable key when the name no longer matches)
//   4. an ancestor whose *name* is a known region code, for units whose
//      political area is encoded in the name rather than the type
//   5. null — caller decides how to render "unknown"
//
// The CATEGORY tier ("Zones" / "Regions") is transparent: it carries no
// political meaning and is simply stepped over on the way to the zone below.

/** Region codes that appear as org-unit names (or `code`) in this structure. */
const REGION_CODES = [
  "WAAZ", "NAAZ", "SWAAZ", "SAAZ", "EAAZ",
  "CWR", "WR", "ER", "NR", "SR", "SER", "SWR", "SSWR", "SSER", "WWR",
] as const

/** Top-of-tree nodes that carry no political meaning. */
const IGNORED_NAMES = new Set(["ROOT", "Ethiopia"])

const REGION_CODE_PATTERNS = REGION_CODES.map((code) => new RegExp(`^${code}$`, "i"))

/** Minimal shape both sides can supply: part of OrgUnit, or a tree node. */
export type PoliticalAreaNode = { name: string; type: string; code?: string | null }

/**
 * Resolve the political area from an org chain.
 *
 * @param chain Root-to-leaf ordered ancestors (e.g. Ethiopia → Corporate →
 *              Division → Region → Zone → Site), as produced by
 *              `buildPathMap` on the client or a parentId walk on the server.
 * @returns The area name, or null when the chain resolves to none.
 */
export function resolvePoliticalArea(chain: PoliticalAreaNode[] | null | undefined): string | null {
  if (!chain?.length) return null

  const nodes = chain.filter((n) => n && !IGNORED_NAMES.has(n.name))
  if (nodes.length === 0) return null

  // 1. Corporate wins — an asset held by a corporate entity is reported
  //    against the corporate area, not its operating region.
  const corporate = nodes.find((n) => n.type === "CORPORATE")
  if (corporate) return corporate.name

  // 2. Outermost REGION/ZONE. The chain is root-first, so the first hit is the
  //    highest political administration above the unit. The stored `code` wins
  //    over the display name: zones/regions can now be renamed by an admin, and
  //    reports keyed on "EAAZ" must not follow a cosmetic rename.
  const region = nodes.find((n) => n.type === "REGION" || n.type === "ZONE")
  if (region) return region.code?.trim() || region.name

  // 3. Known region code on any ancestor, as the `code` column…
  const byCode = nodes.find((n) =>
    n.code && REGION_CODE_PATTERNS.some((re) => re.test(n.code as string)),
  )
  if (byCode) return (byCode.code as string).trim()

  // 4. …or spelled out in the name (units whose political area is encoded in
  //    the name rather than the type).
  const byName = nodes.find((n) => REGION_CODE_PATTERNS.some((re) => re.test(n.name)))
  if (byName) return byName.name

  return null
}

/** Display helper — resolves to "—" when there is no political area. */
export function politicalAreaLabel(chain: PoliticalAreaNode[] | null | undefined): string {
  return resolvePoliticalArea(chain) ?? "—"
}
