// lib/prisma.ts
//
// SQLite (libSQL) edition. A single file-backed database (./dev.db by default)
// is used for both the Prisma CLI (schema push) and the runtime client, so no
// external database server is required. A relative `file:` URL is resolved
// against the current working directory by libSQL, matching the CLI.
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"

const globalForPrisma = global as unknown as {
  prisma: PrismaClient
}

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./dev.db"
  return new PrismaClient({
    adapter: new PrismaLibSql({ url }),
    log: [
      { emit: "stdout", level: "warn" },
      { emit: "stdout", level: "error" },
    ],
  })
}

export const prisma = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

export default prisma