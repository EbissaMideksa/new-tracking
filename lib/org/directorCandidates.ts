export type DirectorOption = {
  id: string
  name: string
  email: string
  role: string
  orgUnitName: string | null
}

export async function fetchDirectorCandidates(q: string, signal?: AbortSignal): Promise<DirectorOption[]> {
  const qs = new URLSearchParams()
  if (q.trim()) qs.set("q", q.trim())
  const res = await fetch(`/api/org/director-candidates?${qs}`, { signal, cache: "no-store" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `Failed to load directors (${res.status})`)
  }
  return res.json()
}
