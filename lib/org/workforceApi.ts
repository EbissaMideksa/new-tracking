
import type { ZoneWorkforce } from "./workforceTypes"

export async function fetchZoneWorkforce(
  zoneCode: string,
  scope: { division: string; department: string } | null,
  signal?: AbortSignal,
): Promise<ZoneWorkforce> {
  const qs = scope
    ? `?${new URLSearchParams({ division: scope.division, department: scope.department })}`
    : ""
  const res = await fetch(
    `/api/org/zones/${encodeURIComponent(zoneCode)}/workforce${qs}`,
    { signal, cache: "no-store" },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export async function fetchCorporateWorkforce(
  scope: { division: string; department: string },
  signal?: AbortSignal,
): Promise<ZoneWorkforce> {
  const qs = new URLSearchParams(scope)
  const res = await fetch(`/api/org/corporate-workforce?${qs}`, { signal, cache: "no-store" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}
