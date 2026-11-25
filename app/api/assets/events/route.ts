

// app/api/assets/events/route.ts
import { subscribe } from "@/lib/broadcast"
import { getCurrentUser } from "@/lib/auth"
import { inScope } from "@/lib/sseScope"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  // The subscriber's own scope. Asset events are filtered against this so live
  // updates never cross an org boundary (previously every authenticated user
  // received every asset published anywhere in the country).
  const viewerPath = user.orgUnit.path

  const encoder = new TextEncoder()
  let closed = false   // ← guard: prevents enqueue after the stream is closed

  const stream = new ReadableStream({
    start(controller) {
      // ── Safe enqueue helper ────────────────────────────────────────────────
      function safeEnqueue(chunk: string) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Stream closed between the guard check and enqueue — mark and stop
          closed = true
        }
      }

      // Initial connection confirmation (lets the client know the stream is live)
      safeEnqueue(": connected\n\n")

      // Keepalive ping every 15 s — prevents proxies from closing idle connections
      const keepAlive = setInterval(() => {
        if (closed) { clearInterval(keepAlive); return }
        safeEnqueue(": keepalive\n\n")
      }, 15_000)

      // Subscribe to asset events published by API routes via broadcast.publish()
      const unsub = subscribe("assets", (payload: any) => {
        if (closed) return
        // ── Org scoping (fail-closed) ───────────────────────────────────────
        // Publishers attach the asset's orgUnit.path as `orgPath`; drop the
        // event unless the subscriber's scope contains it. Data-free signals
        // opt in explicitly via GLOBAL_SCOPE.
        if (!inScope(viewerPath, payload?.orgPath)) return
        safeEnqueue(`data: ${JSON.stringify(payload)}\n\n`)
      })


      // cancel() is invoked by the runtime when the client disconnects
      return () => {
        closed = true
        clearInterval(keepAlive)
        unsub()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",   // disables Nginx response buffering for SSE
    },
  })
}

