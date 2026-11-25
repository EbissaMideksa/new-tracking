
// app/api/events/user/route.ts
//
// SSE endpoint — streams profile-update events to the authenticated user.
// Every open browser tab/window subscribes here via useLiveChannel().
//
// Flow:
//   1. User saves profile in PersonalInfoForm
//   2. PATCH /api/settings/personal saves to DB + calls publish(`user:${id}`, payload)
//   3. Redis delivers payload to ALL server instances
//   4. This SSE route streams it to ALL connected browsers for that user

import { NextRequest } from "next/server"
import { subscribe } from "@/lib/broadcast"
import { getCurrentUser } from "@/lib/auth"   // ← your existing auth helper

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const me = await getCurrentUser()
  if (!me) return new Response("Unauthorized", { status: 401 })

  const channel = `user:${me.id}`
  const encoder = new TextEncoder()
  let closed    = false

  const stream = new ReadableStream({
    start(controller) {
      function send(chunk: string) {
        if (closed) return
        try { controller.enqueue(encoder.encode(chunk)) } catch { closed = true }
      }

      // Initial handshake — tells useLiveChannel the connection is alive
      send(": connected\n\n")

      // Subscribe to Redis / in-process channel
      const unsub = subscribe(channel, (payload: any) => {
        send(`data: ${JSON.stringify(payload)}\n\n`)
      })

      // Keepalive ping every 20 s — prevents proxies/load-balancers from
      // closing idle connections (Vercel, nginx, AWS ALB all need this)
      const ping = setInterval(() => send(": ping\n\n"), 20_000)

      // Cleanup when the browser disconnects
      req.signal.addEventListener("abort", () => {
        closed = true
        clearInterval(ping)
        unsub()
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",   // disables nginx buffering
    },
  })
}
