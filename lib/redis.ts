// lib/redis.ts
//
// No Redis in this edition. This is a tiny in-process key/value shim that
// implements the small surface the app uses (get/set/incr/del/pexpire/ping) so
// the org-tree cache and health check keep working without a server.

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

export const redis = {
  async get(key: string): Promise<string | null> {
    return alive(key)?.value ?? null
  },
  async set(key: string, value: string, _ex?: string, px?: number): Promise<"OK"> {
    store.set(key, { value, expiresAt: px ? Date.now() + px : null })
    return "OK"
  },
  async incr(key: string): Promise<number> {
    const cur = alive(key)
    const next = Number(cur?.value ?? "0") + 1
    store.set(key, { value: String(next), expiresAt: cur?.expiresAt ?? null })
    return next
  },
  async del(key: string): Promise<number> {
    return store.delete(key) ? 1 : 0
  },
  async pexpire(key: string, ms: number): Promise<boolean> {
    const e = alive(key)
    if (!e) return false
    e.expiresAt = Date.now() + ms
    return true
  },
  async ping(): Promise<string> {
    return "PONG"
  },
}

let treeVersion = 0

export async function bumpTreeVersion(): Promise<void> {
  treeVersion += 1
  store.set("tree:version", { value: String(treeVersion), expiresAt: null })
}

export async function getTreeVersion(): Promise<string> {
  return alive("tree:version")?.value ?? "0"
}