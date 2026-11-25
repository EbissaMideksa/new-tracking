// app/api/admin/user-permissions/events/route.ts
// ──────────────────────────────────────────────────────────────────────────
// SSE stream for real-time per-user permission override updates. Payloads
// carry the affected userId so listeners can ignore updates for other
// users, or (on the Accounts Management screen) refresh whichever user is
// currently selected. Mirrors the existing permissions/events and
// wo-permissions/events routes exactly.
// ──────────────────────────────────────────────────────────────────────────

import { getCurrentUser } from "@/lib/auth"
import { subscribe } from "@/lib/broadcast"
import { loadPermissionsFromDB } from "@/lib/permissions"
import { loadUserOverrides } from "@/lib/userPermissions"
import { effectiveCan } from "@/lib/effectivePermissions"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  // This channel carries the grant/revoke list of a NAMED user. Previously it
  // was streamed to every authenticated session, so any user could watch the
  // permission overrides of any other user — a map of who holds elevated
  // access, which is exactly the reconnaissance an attacker wants.
  //
  // Two audiences legitimately need it:
  //   1. the affected user themselves (so their own UI reacts immediately), and
  //   2. whoever manages the permission matrices (the Accounts Management UI).
  const managesPermissions = await (async () => {
    try {
      const matrix = await loadPermissionsFromDB()
      const overrides = await loadUserOverrides(user.id)
      return (
        effectiveCan(matrix, user.role, "manage_permissions", overrides.admin) ||
        effectiveCan(matrix, user.role, "manage_wo_permissions", overrides.admin)
      )
    } catch {
      return false // fail closed
    }
  })()

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return }
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")) }
        catch { clearInterval(heartbeat) }
      }, 25_000)

      unsubscribe = subscribe("user_permissions", (payload) => {
        if (closed) return
        try {
          // ── Scope to the affected user (or a permission manager) ──────────
          const targetUserId = (payload as any)?.userId
          if (!managesPermissions && targetUserId !== user.id) return
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        } catch { /* client gone */ }
      })

      return () => {
        closed = true
        clearInterval(heartbeat)
        unsubscribe?.()
      }
    },
    cancel() {
      closed = true
      unsubscribe?.()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}


