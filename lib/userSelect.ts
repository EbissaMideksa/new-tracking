// lib/userSelect.ts
//
// The ONE shape every /api/users response carries — GET, POST, PUT and PATCH
// (and therefore the SSE payloads those handlers publish) all select through
// this object.
//
// It exists because the handlers used to drift: GET selected `department`
// while POST/PUT/PATCH only did `include: { orgUnit: true }`, so the row a
// caller saw after an edit silently lost its department (and now would lose
// the new directory columns and workload counters as well). Sharing a single
// select makes "what the list shows" and "what a write returns" the same
// thing by construction.
//
// `password` is never selected, so responses are safe to publish verbatim.
import type { Prisma } from "@/app/generated/prisma/client"

// Work orders that do NOT count as open workload on the Users page — the
// status vocabulary lives in app/api/workorders (CREATED, ASSIGNED,
// CHECKED_OUT, IN_PROGRESS are still in flight).
const CLOSED_WO_STATUSES = ["COMPLETED", "ARCHIVED"]

export const userSelect: Prisma.UserSelect = {
  id:        true,
  email:     true,
  name:      true,
  phone:     true,
  role:      true,
  orgUnitId: true,
  createdAt: true,
  // Surfaced so the Users page can flag accounts that are still on the
  // built-in default password — never the hash itself.
  mustChangePassword: true,

  // ── Directory attributes (Users page columns) ──────────────────────────────
  employeeId: true,   // "Oracle ID"
  jobTitle:   true,
  status:     true,
  lastLoginAt: true,
  managerId:  true,

  orgUnit:    { select: { id: true, name: true, type: true, path: true } },
  // Second affiliation: the department a field worker belongs to (null for
  // everyone who simply sits in the corporate hierarchy).
  department: { select: { id: true, name: true, path: true } },
  // Operational zone/region for non-corporate (field) workers — drives the
  // operational director's office population. Null for corporate workers.
  geoZoneId: true,
  geoZone:  { select: { id: true, code: true, name: true, category: true } },
  // Reports To.
  manager:    { select: { id: true, name: true, role: true } },

  // ── Workload ───────────────────────────────────────────────────────────────
  // Assigned assets + work orders still in flight (filtered count).
  _count: {
    select: {
      assignedAssets: true,
      assignedWorkOrders: { where: { status: { notIn: CLOSED_WO_STATUSES } } },
    },
  },
}
