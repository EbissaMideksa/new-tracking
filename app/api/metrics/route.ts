
// app/api/metrics/route.ts
//
// Prometheus scrape endpoint.
//
// This route used to be completely unauthenticated, and nginx's catch-all
// `location /` proxied it to the public internet — exposing heap/GC/event-loop/
// file-descriptor gauges (prom-client's collectDefaultMetrics) to anyone who
// asked. Access is now restricted two ways:
//
//   1. nginx.cloud.conf / nginx.conf return 404 for this exact path, so it is
//      never reachable from outside the Docker network.
//   2. This handler independently refuses any request that arrived through a
//      reverse proxy (proxy headers present) unless METRICS_TOKEN is configured
//      and matches. Prometheus scrapes `app-blue:3000` / `app-green:3000`
//      directly over the `internal` network, so those scrapes have no proxy
//      headers and are allowed.
//
// To scrape over a proxy instead, set METRICS_TOKEN and add to prometheus.yml:
//   authorization:
//     credentials: <METRICS_TOKEN>

import { timingSafeEqual } from "crypto"
import { NextRequest } from "next/server"
import { registry } from "@/lib/metrics"

export const dynamic = "force-dynamic"

// 404 rather than 403 — don't confirm that a metrics endpoint exists.
const notFound = () => new Response("Not Found", { status: 404 })

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch — compare lengths first.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  const expected = process.env.METRICS_TOKEN

  if (expected) {
    const header = req.headers.get("authorization") ?? ""
    const provided = header.startsWith("Bearer ") ? header.slice(7) : ""
    if (!provided || !tokenMatches(provided, expected)) return notFound()
  } else {
    // No token configured → only accept direct, non-proxied connections.
    const proxied =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-proto")
    if (proxied) return notFound()
  }

  const body = await registry.metrics()
  return new Response(body, {
    headers: { "Content-Type": registry.contentType },
  })
}
