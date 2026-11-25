// lib/org/orgApi.ts — client-side API calls for org data.
// Used by client components to fetch/refresh org data without a page reload.

import type { GeoCategory, OrgOverview } from "@/lib/org/types";

export interface OrgOverviewResponse {
  overview: OrgOverview;
}

export interface UnitListResponse {
  units: Array<{
    id: string;
    name: string;
    zoneId: string;
    zoneCode: string;
    departmentId: string;
    departmentName: string;
    divisionId: string;
    divisionName: string;
  }>;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
    cache: "no-store", // always fetch fresh data
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Fetch the full org overview from the server. */
export async function fetchOrgOverview(): Promise<OrgOverviewResponse["overview"]> {
  const data = await fetchJson<OrgOverviewResponse>("/api/org/overview");
  return data.overview;
}

/** Fetch local units, optionally filtered by department or zone. */
export async function fetchUnits(params?: {
  departmentId?: string;
  zoneId?: string;
}): Promise<UnitListResponse["units"]> {
  const qs = new URLSearchParams();
  if (params?.departmentId) qs.set("departmentId", params.departmentId);
  if (params?.zoneId) qs.set("zoneId", params.zoneId);
  const path = `/api/org/units${qs.toString() ? `?${qs.toString()}` : ""}`;
  const data = await fetchJson<UnitListResponse>(path);
  return data.units;
}

/** Create a new local unit under a department in a zone. */
export async function createUnit(body: { departmentId: string; zoneId: string }) {
  const res = await fetch("/api/org/units", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as { unit: { id: string; name: string; zoneId: string; zoneCode: string } };
}

// ── Hierarchy editing (gated server-side by `manage_org_units`) ──────────────

/** Create a division (under the corporate root) or a department (under a division). */
export async function createNode(body: {
  kind: "DIVISION" | "DEPARTMENT";
  parentId?: string;
  name: string;
  code?: string;
  subtitle?: string;
  /** Department placement: "CORPORATE_ONLY" or "SPREADABLE" (default). */
  placement?: string | null;
}) {
  return fetchJson<{ node: { id: string; name: string; placement?: string | null } }>("/api/org/nodes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Rename / recode a division or department. */
export async function updateNode(id: string, patch: { name?: string; code?: string; subtitle?: string }) {
  return fetchJson<{ node: { id: string; name: string } }>(`/api/org/nodes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Delete an empty division / department / local unit. */
export async function deleteNode(id: string) {
  return fetchJson<{ node: { id: string } }>(`/api/org/nodes/${id}`, { method: "DELETE" });
}

// ── Legacy OrgUnit edits ─────────────────────────────────────────────────────
// The Organization page now reads the SAME OrgUnit tree the admin editor and
// the Users/Assets pages use, so its structural edits go through /api/org.

/** Rename a division / department / unit in the OrgUnit tree. */
export async function renameOrgUnit(id: string, name: string) {
  return fetchJson<{ success: boolean; node: any }>(`/api/org/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

/** Create a node in the OrgUnit tree (DIVISION / DEPARTMENT / SECTION / …). */
export async function createOrgUnitNode(body: {
  type: string;
  name: string;
  parentId?: string | null;
  code?: string;
  placement?: string | null;
}) {
  return fetchJson<any>("/api/org", { method: "POST", body: JSON.stringify(body) });
}

/** Delete an empty node from the OrgUnit tree. */
export async function deleteOrgUnit(id: string) {
  return fetchJson<{ success: boolean; deleted: any }>(`/api/org/${id}`, { method: "DELETE" });
}

/** Assign (or clear, with nulls) the shared Operational Director of a geography.
 *  Pass `directorUserId` (a real User) — the server resolves the display name. */
export async function setZoneDirector(
  zoneId: string,
  input: { directorUserId?: string | null; directorName?: string | null }
) {
  return fetchJson<{ zone: { id: string; code: string; directorName: string | null } }>(
    `/api/org/zones/${zoneId}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

/** Assign (or clear) the functional director of a department node. */
export async function setDepartmentDirector(
  nodeId: string,
  input: { directorUserId?: string | null; directorName?: string | null }
) {
  return fetchJson<{ node: { id: string; name: string; directorName: string | null } }>(
    `/api/org/nodes/${nodeId}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export interface DirectorCandidate {
  id: string;
  name: string;
  email: string;
  role: string;
}

/** Searchable list of users eligible to be an Operational / Functional director.
 *  `signal` lets the picker abort a hung request instead of spinning forever. */

/* export async function fetchDirectorCandidates(q?: string, signal?: AbortSignal): Promise<DirectorCandidate[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const data = await fetchJson<{ candidates: DirectorCandidate[] }>(
    `/api/org/director-candidates${qs}`,
    { signal }
  );
  return data.candidates;
} */

export type { GeoCategory };

/** Fetch users (manager, supervisor, user) with org unit and department info,
 *  for display under the org structure sections/groups. */
export interface OrgUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  orgUnitId: string | null;
  orgUnit: { id: string; name: string; type: string; path: string } | null;
  department: { id: string; name: string; path: string } | null;
}

export async function fetchOrgUsers(): Promise<OrgUser[]> {
  const data = await fetchJson<{ users: OrgUser[] }>("/api/org/users");
  return data.users;
}

export async function fetchDirectorCandidates(q = "", signal?: AbortSignal) {
  const qs = new URLSearchParams()
  if (q.trim()) qs.set("q", q.trim())
  const res = await fetch(`/api/org/director-candidates?${qs}`, { signal, cache: "no-store" })
  if (!res.ok) throw new Error(`Failed to load directors (${res.status})`)
  return (await res.json()) as {
    id: string; name: string; email: string; role: string; orgUnitName: string | null
  }[]
}
