// scripts/check-test-app-db.ts
//
// Preflight for the local test app (`make test-app` → host `next dev` with .env).
// Verifies the runner can reach the PRODUCTION Postgres and Redis through the
// loopback ports published by docker-compose-cloud.yml (5433 / 6380) before you
// start developing against live production data.
//
// USAGE: npx tsx scripts/check-test-app-db.ts   (or `make test-app-check`)

import "dotenv/config"
import { Pool } from "pg"
import Redis from "ioredis"

async function main(): Promise<void> {
  // ── Postgres (production db container, loopback 5433) ─────────────────────
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (.env)")
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  })
  const { rows } = await pool.query("select current_database() as db, current_user as usr")
  console.log(`OK   postgres → ${rows[0].db} as ${rows[0].usr} (${new URL(process.env.DATABASE_URL).host})`)
  await pool.end()

  // ── Redis (production redis container, loopback 6380) ─────────────────────
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is not set (.env)")
  const redis = new Redis(process.env.REDIS_URL, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: () => null, // fail fast instead of retrying forever
  })
  redis.on("error", () => {}) // surfaced via the rejected connect() below
  await redis.connect()
  const pong = await redis.ping()
  const host = new URL(process.env.REDIS_URL).host
  await redis.quit()
  console.log(`OK   redis    → ${pong} (${host})`)

  console.log("\nLocal test app can reach the PRODUCTION db + redis — safe to run `make test-app`.")
}

main().catch((e: Error) => {
  console.error(`FAIL ${e.message}`)
  console.error("Is the production stack up? Try: make start")
  process.exit(1)
})
