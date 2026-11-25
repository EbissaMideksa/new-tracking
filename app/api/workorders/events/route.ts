// app/api/workorders/events/route.ts
import { getCurrentUser } from "@/lib/auth"
import { subscribe } from "@/lib/broadcast"   // ← was lib/sse
import { inScope } from "@/lib/sseScope"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  // Filter work-order events to the subscriber's own org subtree. Without this
  // every authenticated user received every work order (and its linked asset
  // details) created or updated anywhere in the country.
  const viewerPath = user.orgUnit.path

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")) }
        catch { clearInterval(heartbeat) }
      }, 25_000)

      unsubscribe = subscribe("workorders", (payload) => {
        try {
          // ── Org scoping (fail-closed) ─────────────────────────────────────
          if (!inScope(viewerPath, (payload as any)?.orgPath)) return
          // payload is an object — must stringify for SSE wire format
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        } catch { /* client gone */ }
      })


      return () => { clearInterval(heartbeat); unsubscribe?.() }
    },
    cancel() { unsubscribe?.() },
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
