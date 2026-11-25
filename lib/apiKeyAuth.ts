// lib/apiKeyAuth.ts
// API key authentication for external integrations.
// Checks the X-API-Key header against the ApiKey table.
//
// Keys are stored as SHA-256 hashes (ApiKey.keyHash). The raw credential is
// shown exactly once, at creation time, and never persisted — previously the
// plaintext key sat in the table, so a DB dump or the nightly backup volume
// handed out working credentials.

import crypto from "crypto"
import prisma from "@/lib/prisma"

/** SHA-256 (hex) of a presented key. Single source of truth for the algorithm. */
export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex")
}

export async function getApiKeyUser(req: Request): Promise<{ id: string; name: string; role: string; orgUnit: { id: string; path: string } } | null> {
  const apiKey = req.headers.get("x-api-key")?.trim()
  if (!apiKey) return null

  // Match on the hash. The `key: apiKey` branch is a compatibility fallback for
  // rows written before migration 20260923000000 backfilled the hashes; it is
  // harmless once every row has a keyHash and can be dropped in a later release.
  const key = await prisma.apiKey.findFirst({
    where: {
      active: true,
      OR: [{ keyHash: hashApiKey(apiKey) }, { key: apiKey }],
    },
    include: { createdBy: { include: { orgUnit: { select: { id: true, path: true } } } } },
  })
  if (!key || !key.createdBy) return null

  // Update last used (fire-and-forget)
  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return {
    id: key.createdBy.id,
    name: key.createdBy.name,
    role: key.createdBy.role,
    orgUnit: key.createdBy.orgUnit,
  }
}

