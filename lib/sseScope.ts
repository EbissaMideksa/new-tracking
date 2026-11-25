// lib/sseScope.ts
// ─────────────────────────────────────────────────────────────────────────────
// Org-scoping for Server-Sent Events.
//
// THE PROBLEM THIS SOLVES
//   SSE endpoints were authenticated but not authorised. Every logged-in user
//   could open /api/assets/events (or /api/workorders/events) and receive the
//   FULL asset/work-order objects published by *anyone* in the country —
//   serial numbers, tag numbers, locations, work-order details. Scoping only
//   happened later, in the browser, which is not a security boundary.
//
// HOW IT WORKS
//   Publishers attach the org path of the record they are announcing:
//     broadcastScoped("assets", { event, asset }, asset.orgUnit.path)
//   The SSE handler compares that against the subscriber's own org path and
//   drops anything outside it, using the same `canAccess` rule the REST API
//   uses — so live updates and API reads agree on what a user may see.
//
// FAIL-CLOSED
//   A payload with no scope at all is NOT delivered. That is deliberate: if a
//   publisher forgets to attach a path, the event is dropped (a missing live
//   refresh) rather than leaked. Data-free "something changed" signals opt in
//   explicitly with GLOBAL_SCOPE.
// ─────────────────────────────────────────────────────────────────────────────

import { canAccess } from "./rbac"

/**
 * Marker for a payload that carries NO tenant data — e.g. `{ event: "invalidate" }`.
 * These are delivered to every subscriber because they only tell a client to
 * re-fetch through the (already scoped) REST API.
 */
export const GLOBAL_SCOPE = "*"

/**
 * @param viewerPath   the subscriber's own orgUnit.path
 * @param payloadScope the payload's `orgPath`
 * @returns true when this subscriber may receive the event
 */
export function inScope(viewerPath: string, payloadScope: unknown): boolean {
  if (payloadScope === GLOBAL_SCOPE) return true
  // Absent/empty scope → fail closed.
  if (typeof payloadScope !== "string" || payloadScope.length === 0) return false
  return canAccess(viewerPath, payloadScope)
}
