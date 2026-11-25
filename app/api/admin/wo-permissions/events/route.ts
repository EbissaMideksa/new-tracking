// app/api/admin/wo-permissions/events/route.ts
// ──────────────────────────────────────────────────────────────────────────────
// Server-Sent Events stream for real-time WO permission matrix updates.
// Any authenticated user connects here; when a SUPER_ADMIN saves the matrix the
// new payload is pushed to all open streams so canWo() updates live.
// ──────────────────────────────────────────────────────────────────────────────

import { getCurrentUser } from "@/lib/auth"
import { subscribe } from "@/lib/broadcast"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

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

      unsubscribe = subscribe("wo_permissions", (payload) => {
        if (closed) return
        try {
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
