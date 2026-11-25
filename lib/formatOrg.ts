// lib/formatOrg.ts

export function buildPathMap(
  node: any,
  path: any[] = [],
  map: Record<string, any[]> = {},
): Record<string, any[]> {
  if (!node) return map
  const current = [...path, node]
  map[node.id] = current
  for (const child of node.children ?? []) buildPathMap(child, current, map)
  return map
}

export function formatOwningDepartment(pathNodes: any[]): string {
  if (!pathNodes?.length) return "—"
  const get = (type: string) => pathNodes.find((n: any) => n.type === type)?.name
  const division   = get("DIVISION")
  const department = get("DEPARTMENT")
  const region     = get("REGION") || get("ZONE")
  const section    = get("SECTION")
  const group      = get("GROUP")
  const area       = get("AREA")
  const site       = get("SITE")
  const shortDivision   = division  === "Fixed Network"         ? "FN"  : division
  const shortDepartment = department === "Operations & Maintenance" ? "O&M" : department
  const divDept = [shortDivision, shortDepartment].filter(Boolean).join("-")
  const areaGroup = site ? site.replace(/\s+(Group[- ]?\d+)$/i, "-$1") : (area || "")
  // Corporate arm: Section → Group → User (no Area/Site tier)
  if (section && !area && !site) {
    const groupPart = group ? ` ${group}` : ""
    return [divDept, region, section + groupPart].filter(Boolean).join(" ") || "—"
  }
  return [divDept, region, areaGroup].filter(Boolean).join(" ") || "—"
}

export function getPoliticalAreaFromPath(pathNodes: any[]): string {
  if (!pathNodes?.length) return "—"
  const ignored = ["ROOT", "Ethiopia"]
  const cleaned = pathNodes.filter((n) => !ignored.includes(n.name))
  const corpNode = cleaned.find((n) => n.type === "CORPORATE")
  if (corpNode) return corpNode.name

  // Prefer the TYPE over a name pattern: zones/regions may be renamed by an
  // admin (the structure is now editable), and a section named "EAAZ FN O&M"
  // would otherwise not resolve. Categories sit above and carry no political
  // meaning, so they are skipped implicitly — the zone/region below them wins.
  const zoneRegion = cleaned.find((n) => n.type === "ZONE" || n.type === "REGION")
  if (zoneRegion) return zoneRegion.code || zoneRegion.name

  // Fall back to a known code, either as the stored `code` column or spelled
  // out in the name (matches the server resolver in lib/politicalArea.ts).
  const patterns = [/^WAAZ$/i, /^NAAZ$/i, /^SWAAZ$/i, /^SAAZ$/i, /^EAAZ$/i,
    /^CWR$/i, /^WR$/i, /^ER$/i, /^NR$/i, /^SR$/i, /^SER$/i, /^SWR$/i,
    /^SSWR$/i, /^SSER$/i, /^WWR$/i]
  const byCode = cleaned.find((n) => n.code && patterns.some((pat) => pat.test(n.code)))
  if (byCode) return byCode.code
  for (const pat of patterns) {
    const found = cleaned.find((n) => pat.test(n.name))
    if (found) return found.name
  }
  return "—"
}

