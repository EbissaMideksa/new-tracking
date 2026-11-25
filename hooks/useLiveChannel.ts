
// hooks/useLiveChannel.ts
"use client"

import { useEffect, useRef } from "react"

/**
 * Subscribes to a Server-Sent Events endpoint and calls onMessage with each
 * parsed payload.  Auto-reconnects after 5 s on connection loss.
 *
 * The callback-ref pattern lets you pass an inline arrow function without
 * causing the effect to re-run on every render.
 *
 * @example
 *   useLiveChannel("/api/events/user", (payload) => {
 *     if (payload.type === "PROFILE_UPDATED") setUser(u => ({ ...u, ...payload }))
 *   })
 */
export function useLiveChannel<T = any>(
  url: string,
  onMessage: (payload: T) => void,
  enabled: boolean = true
) {
  const cbRef = useRef(onMessage)
  useEffect(() => { cbRef.current = onMessage }, [onMessage])

  useEffect(() => {
    // When disabled, don't open an EventSource. This lets callers that
    // conditionally render null (e.g. Topbar on the workorders route) avoid
    // holding a wasted SSE connection that counts toward the browser's
    // per-origin HTTP/1.1 connection limit.
    if (!enabled) return
    let es: EventSource
    let retryTimeout: ReturnType<typeof setTimeout>

    function connect() {
      es = new EventSource(url)

      es.onmessage = (e) => {
        try {
          cbRef.current(JSON.parse(e.data) as T)
        } catch {
          // heartbeat / comment frames (": ping") don't reach onmessage, ignore errors
        }
      }

      es.onerror = () => {
        es.close()
        retryTimeout = setTimeout(connect, 5_000)
      }
    }

    connect()
    return () => { clearTimeout(retryTimeout); es?.close() }
  }, [url, enabled])
}
