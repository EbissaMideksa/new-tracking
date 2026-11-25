
// app/api/user/events/route.ts
//
// SSE endpoint that streams profile-update events to all connected clients.
// When a user saves their profile (name/photo), PersonalInfoForm calls
// /api/settings/personal which publishes to the "user:{id}" channel.
// Every open browser tab/window subscribed here receives the update instantly.

import { subscribe } from "@/lib/broadcast"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  // Auth check — only serve the stream to authenticated users
  const me = await getCurrentUser()
  if (!me) {
    return new Response("Unauthorized", { status: 401 })
  }

  const encoder = new TextEncoder()
  let closed = false
  const channel = `user:${me.id}`

  const stream = new ReadableStream({
    start(controller) {
      function safeEnqueue(chunk: string) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          closed = true
        }
      }

      safeEnqueue(": connected\n\n")

      const keepAlive = setInterval(() => {
        if (closed) { clearInterval(keepAlive); return }
        safeEnqueue(": keepalive\n\n")
      }, 15_000)

      const unsub = subscribe(channel, (payload: any) => {
        if (closed) return
        safeEnqueue(`data: ${JSON.stringify(payload)}\n\n`)
      })

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
      "X-Accel-Buffering": "no",
    },
  })
}
