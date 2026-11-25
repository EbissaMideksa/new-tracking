// This route provides a Server-Sent Events (SSE) stream for real-time updates on permissions changes.
// It checks for an authenticated user and then sets up a stream that sends updates whenever permissions change.
// The client can listen to this stream to receive real-time updates without needing to poll the server.
// The `subscribe` function is assumed to be a utility that allows subscribing to a "permissions" event channel, and it returns an unsubscribe function to stop listening when the client disconnects.
// The `dynamic = "force-dynamic"` export ensures that this route is treated as dynamic and not statically optimized by Next.js, which is necessary for SSE to work correctly.
// Note: This code assumes that the `subscribe` function and the permissions event channel are properly implemented elsewhere in the application.
// app/api/admin/permissions/events/route.ts
import { getCurrentUser } from "@/lib/auth"
import { subscribe } from "@/lib/broadcast"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")) }
        catch { clearInterval(heartbeat) }
      }, 25_000)

      unsubscribe = subscribe("permissions", (payload) => {
        try {
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
