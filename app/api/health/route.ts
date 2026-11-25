
// app/api/health/route.ts
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { redis } from "@/lib/redis"

export const dynamic = "force-dynamic"

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ])

export async function GET() {
  const [dbCheck, redisCheck] = await Promise.allSettled([
    withTimeout(prisma.$queryRaw`SELECT 1`, 3000),
    withTimeout(redis.ping(), 3000),
  ])

  const db = dbCheck.status === "fulfilled"
  const redisOk =
    redisCheck.status === "fulfilled" && redisCheck.value === "PONG"
  const ok = db && redisOk

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      checks: { db, redis: redisOk },
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  )
}
