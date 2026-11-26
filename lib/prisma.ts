// lib/prisma.ts
//
// PostgreSQL edition. Prisma 7 requires a driver adapter; we use the native
// `pg` adapter. The connection string comes from DATABASE_URL.
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = global as unknown as {
  prisma: PrismaClient
}

function makeClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://asset:asset@localhost:5432/asset_tracking"
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: [
      { emit: "stdout", level: "warn" },
      { emit: "stdout", level: "error" },
    ],
  })
}

export const prisma = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export default prisma