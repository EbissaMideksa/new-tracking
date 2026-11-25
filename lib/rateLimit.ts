// lib/rateLimit.ts
//
// In-process fixed-window rate limiter (no Redis). Counters live in a module
// Map and reset on restart, which is fine for a single-process local app.

const buckets = new Map<string, { count: number; resetAt: number }>()

function limit(key: string, limitCount: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = buckets.get(key)

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limitCount) return false
  entry.count++
  return true
}

const purge = setInterval(() => {
  const now = Date.now()
  for (const [key, val] of buckets.entries()) {
    if (now > val.resetAt) buckets.delete(key)
  }
}, 5 * 60 * 1000) as unknown as { unref?: () => void }
purge.unref?.()

export async function rateLimit(
  key: string,
  limitCount: number,
  windowMs: number,
): Promise<boolean> {
  return limit(key, limitCount, windowMs)
}

export async function rateLimitReset(key: string): Promise<void> {
  buckets.delete(key)
}