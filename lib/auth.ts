
// lib/auth.ts — single source of truth, delete app/api/auth.ts
import { cookies } from "next/headers"
import { verifyToken } from "./jwt"
import prisma from "./prisma"
import { redis } from "./redis"

// Cache the authenticated user (with the deep orgUnit include) for 30s.
// getCurrentUser runs on every API call; without caching each call pays a
// ~190ms remote-Neon round-trip just for auth. Cache is best-effort: a Redis
// failure falls back to the DB query.
const USER_CACHE_TTL = 30

export async function getCurrentUser() {
  const token = (await cookies()).get("token")?.value
  if (!token) return null

  const decoded = verifyToken(token)
  if (!decoded || typeof decoded !== "object" || !("id" in decoded)) return null

  const userId = decoded.id as string
  const cacheKey = `user:${userId}`

  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached)
      // Defensive: entries written before the `omit` above — or by any other
      // writer — may still carry the hash. Strip it on read so a hash can never
      // leave this function, whatever Redis happens to hold.
      if (parsed && typeof parsed === "object" && "password" in parsed) {
        delete parsed.password
      }
      return parsed
    }
  } catch {}

  const user = await prisma.user.findUnique({
    where: { id: userId },
    // Never load the bcrypt hash here. This object is (a) JSON-serialized into
    // Redis for USER_CACHE_TTL seconds and (b) returned to every route that
    // calls getCurrentUser(), and (c) passed from app/dashboard/layout.tsx into
    // the client shell. Omitting it keeps hashes out of Redis, out of API
    // responses, and out of the client payload. Routes that genuinely need the
    // hash (e.g. /api/settings/password) select it explicitly.
    omit: { password: true },
    include: {
      orgUnit: {
        include: {
          parent: {
            include: {
              parent: {
                include: {
                  parent: {
                    include: {
                      parent: { include: { parent: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
  })

  if (user) {
    try {
      await redis.set(cacheKey, JSON.stringify(user), "EX", USER_CACHE_TTL)
    } catch {}
  }

  return user
}

// Call this after a user updates their own profile/photo/role so the cached
// copy is invalidated immediately (otherwise stale for up to USER_CACHE_TTL).
export async function invalidateCurrentUser(userId: string) {
  try {
    await redis.del(`user:${userId}`)
  } catch {}
}
