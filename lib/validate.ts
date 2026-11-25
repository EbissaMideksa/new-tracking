// lib/validate.ts — new file
import { z } from "zod"
import { USER_STATUSES } from "@/lib/userStatus"

/**
 * An account identifier is EITHER a real email address OR a bare username.
 *
 * Some accounts are not tied to a corporate domain — most notably the seeded
 * `admin` account, which is created with the literal identifier "admin" so it
 * can be reached without an @domain. Requiring a valid email here made that
 * account permanently unable to authenticate, which is why it existed but could
 * never be used.
 *
 * Usernames are deliberately narrow: no "@", so an identifier is unambiguously
 * either an email or a username, and no leading/trailing punctuation.
 */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/i

/** True when `v` is acceptable as an account identifier. */
export function isValidIdentifier(v: string): boolean {
  const trimmed = v.trim()
  if (trimmed.length === 0 || trimmed.length > 254) return false
  if (trimmed.includes("@")) return z.string().email().max(254).safeParse(trimmed).success
  return USERNAME_RE.test(trimmed)
}

const identifier = (field: string) =>
  z
    .string()
    .trim()
    .max(254)
    .refine(isValidIdentifier, { message: `${field} must be a valid email address or username` })

export const loginSchema = z.object({
  email: identifier("Email"),
  password: z.string().min(6).max(128),
})

export const createUserSchema = z.object({
  email: identifier("Email"),
  name: z.string().min(1).max(100).regex(/^[\w\s'-]+$/),
  phone: z.string().max(20).optional(),
  role: z.enum(["SUPER_ADMIN","ADMIN","CHIEF","DIRECTOR","MANAGER","SUPERVISOR","USER"]),
  orgUnitId: z.string().uuid(),
  // Optional: blank/omitted means "provision on the built-in default password"
  // (lib/defaultPassword.ts), which is what the Users page sends. Anything the
  // admin actually types still has to clear the 8-character floor.
  password: z
    .string()
    .max(128)
    .optional()
    .refine((v) => !v || v.length >= 8, { message: "Password must be at least 8 characters" }),

  // ── Directory attributes (blank inputs are normalised to null by the route)
  // employeeId is the "Oracle ID"; status defaults to ACTIVE when omitted.
  employeeId: z.string().trim().max(64).nullish(),
  jobTitle:   z.string().trim().max(120).nullish(),
  status:     z.enum(USER_STATUSES).optional(),
  managerId:  z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  // Operational zone/region for NON-corporate (field) workers. Null for
  // corporate workers. See User.geoZoneId.
  geoZoneId: z.string().uuid().nullish(),
})


export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: identifier("Email").optional(),
  phone: z.string().max(20).optional(),
  role: z.enum(["SUPER_ADMIN","ADMIN","CHIEF","DIRECTOR","MANAGER","SUPERVISOR","USER"]).optional(),
  orgUnitId: z.string().uuid().optional(),
  employeeId: z.string().trim().max(64).nullish(),
  jobTitle:   z.string().trim().max(120).nullish(),
  departmentId: z.string().uuid().nullish(),
  geoZoneId:    z.string().uuid().nullish(),
})

export const patchTagSchema = z.object({
  tagNumber: z.string().max(100).optional(),
})

export const assignSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(500),
  assignToId: z.string().uuid(),
})

export const singleAssignSchema = z.object({
  assetId: z.string().uuid(),
  targetOrgUnitId: z.string().uuid(),
})

export function safeParseBody<T>(schema: z.ZodSchema<T>, data: unknown): 
  { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const msg = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")
    return { success: false, error: msg }
  }
  return { success: true, data: result.data }
}
