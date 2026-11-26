// lib/redis.ts
//
// Uses Redis when REDIS_URL is set (e.g. the `redis` container in
// docker-compose.yml); otherwise falls back to an in-process shim so the app
// still runs without Redis. Implements the small surface the app uses
// (get/set/incr/del/pexpire/ping) plus the org-tree version helpers.
import Redis from "ioredis"

type Entry = { value: string; expiresAt: number | null }

const store = new Map<string, Entry>()

function alive(key: string): Entry | undefined {
  const e = store.get(key)
  if (!e) return undefined
  if (e.expiresAt !== null && Date.now() > e.expiresAt) {
    store.delete(key)
    return undefined
  }
  return e
}

let client: Redis | null = null
if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  client.on("error", () => {})
}

export const redis = {
  async get(key: string): Promise<string | null> {
    if (client) return client.get(key)
    return alive(key)?.value ?? null
  },
  async set(key: string, value: string, _ex?: string, px?: number): Promise<"OK"> {
    if (client) {
      if (px) await client.set(key, value, "EX", px)
      else await client.set(key, value)
      return "OK"
    }
    store.set(key, { value, expiresAt: px ? Date.now() + px : null })
    return "OK"
  },
  async incr(key: string): Promise<number> {
    if (client) return client.incr(key)
    const cur = alive(key)
    const next = Number(cur?.value ?? "0") + 1
    store.set(key, { value: String(next), expiresAt: cur?.expiresAt ?? null })
    return next
  },
  async del(key: string): Promise<number> {
    if (client) return client.del(key)
    return store.delete(key) ? 1 : 0
  },
  async pexpire(key: string, ms: number): Promise<boolean> {
    if (client) return (await client.pexpire(key, ms)) === 1
    const e = alive(key)
    if (!e) return false
    e.expiresAt = Date.now() + ms
    return true
  },
  async ping(): Promise<string> {
    if (client) return client.ping()
    return "PONG"
  },
}

let treeVersion = 0

export async function bumpTreeVersion(): Promise<void> {
  if (client) {
    await client.incr("tree:version")
    return
  }
  treeVersion += 1
  store.set("tree:version", { value: String(treeVersion), expiresAt: null })
}

export async function getTreeVersion(): Promise<string> {
  if (client) return (await client.get("tree:version")) ?? "0"
  return alive("tree:version")?.value ?? "0"
}