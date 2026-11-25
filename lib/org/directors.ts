// lib/org/directors.ts
// ─────────────────────────────────────────────────────────────────────────────
// Places a DIRECTOR account on an org node or on a geography. Two different
// directors exist in the design and must never be confused:
//
//   • Operational director — ONE per geography (GeoZone.directorUserId),
//     shared by every local unit of that zone/region.
//   • Functional director — ONE per department (OrgNode.directorUserId on a
//     DEPARTMENT node), placed as soon as the department exists.
//
// The helpers are idempotent: they reuse the account the legacy field-arm
// seed already provisioned (`director-<geo>@deputyceooffice.com` /
// `director@<department>.<division>.com`) and only create one when it is
// missing, so running this against a fully seeded database is a no-op.
//
// Imports are relative on purpose: prisma/seed.ts runs under tsx, where the
// "@/" alias is not guaranteed to resolve.
import bcrypt from "bcryptjs"
import prisma from "../prisma"
import { DEFAULT_PASSWORD } from "../defaultPassword"
import { OrgType, Role } from "@/lib/enums"

type AnyUser = { id: string; name: string; email: string }

/** "O&M" → "o&m", "Fixed Network" → "fixednetwork" — matches the legacy seed's email pattern. */
function emailSlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "")
}

async function findUserByEmail(email: string): Promise<AnyUser | null> {
  return prisma.user.findFirst({
    where: { email: { equals: email } },
    select: { id: true, name: true, email: true },
  })
}

/** The COUNTRY node of the legacy tree — the fallback home for a new director. */
async function corporateOrgUnitId(): Promise<string> {
  const country =
    (await prisma.orgUnit.findFirst({ where: { type: OrgType.COUNTRY }, select: { id: true } })) ??
    (await prisma.orgUnit.findFirst({ select: { id: true } }))
  if (!country) {
    throw new Error("No legacy org unit found — run the main seed before placing directors.")
  }
  return country.id
}

/** Find (or provision) a DIRECTOR account. Existing accounts are never modified. */
export async function ensureDirectorUser(opts: {
  name: string
  email: string
  orgUnitId?: string | null
}): Promise<AnyUser> {
  const existing = await findUserByEmail(opts.email)
  if (existing) return existing

  const orgUnitId = opts.orgUnitId ?? (await corporateOrgUnitId())
  const password = await bcrypt.hash(DEFAULT_PASSWORD, 12)
  return prisma.user.create({
    data: {
      email: opts.email,
      name: opts.name,
      role: Role.DIRECTOR,
      orgUnitId,
      password,
      // Provisioned account: forced to change the default password at login,
      // exactly like the accounts the main seed creates.
      mustChangePassword: true,
    },
    select: { id: true, name: true, email: true },
  })
}

/** The legacy field unit (ZONE / REGION node) a geography's director sits on. */
async function fieldOrgUnitId(code: string): Promise<string | null> {
  const unit = await prisma.orgUnit.findFirst({
    where: { code, type: { in: [OrgType.ZONE, OrgType.REGION] } },
    select: { id: true },
  })
  return unit?.id ?? null
}

/**
 * Give a geography its shared Operational Director, unless it already has a
 * live one. Reuses `director-<code>@deputyceooffice.com` when it exists.
 */
export async function ensureZoneDirector(zone: {
  id: string
  code: string
  directorUserId?: string | null
}): Promise<AnyUser | null> {
  if (zone.directorUserId) {
    const holder = await prisma.user.findUnique({
      where: { id: zone.directorUserId },
      select: { id: true, name: true, email: true },
    })
    if (holder) return holder // already assigned and the account still exists
  }

  const user = await ensureDirectorUser({
    name: `${zone.code} Operational Director`,
    email: `director-${zone.code.toLowerCase()}@deputyceooffice.com`,
    orgUnitId: await fieldOrgUnitId(zone.code),
  })
  await prisma.geoZone.update({
    where: { id: zone.id },
    data: { directorUserId: user.id, directorName: user.name },
  })
  return user
}

/** Email pattern of a department's functional director (matches the legacy seed). */
export function departmentDirectorEmail(
  departmentName: string,
  divisionSubtitle: string | null,
  divisionName: string
): string {
  const div = emailSlug(divisionSubtitle || divisionName)
  return `director@${emailSlug(departmentName)}.${div}.com`
}

/**
 * Give a department its functional director, unless it already has one.
 * Called by the seed and by createDepartment() — so a department created in
 * the UI immediately has a director placed on it.
 */
export async function ensureDepartmentDirector(
  dept: { id: string; name: string; directorUserId?: string | null },
  division: { name: string; subtitle?: string | null }
): Promise<AnyUser | null> {
  if (dept.directorUserId) {
    const holder = await prisma.user.findUnique({
      where: { id: dept.directorUserId },
      select: { id: true, name: true, email: true },
    })
    if (holder) return holder
  }

  const user = await ensureDirectorUser({
    name: `${dept.name} Director`,
    email: departmentDirectorEmail(dept.name, division.subtitle ?? null, division.name),
    // The functional director sits on the matching department of the legacy
    // tree when one exists, otherwise at Corporate Office.
    orgUnitId:
      (
        await prisma.orgUnit.findFirst({
          where: { name: dept.name, type: OrgType.DEPARTMENT },
          select: { id: true },
        })
      )?.id ?? null,
  })
  await prisma.orgNode.update({
    where: { id: dept.id },
    data: { directorUserId: user.id, directorName: user.name },
  })
  return user
}

/** Users eligible to be picked as an Operational / Functional director. */
export async function listDirectorCandidates(
  query?: string
): Promise<{ id: string; name: string; email: string; role: string }[]> {
  const q = query?.trim()
  return prisma.user.findMany({
    where: {
      role: { in: [Role.DIRECTOR, Role.CHIEF, Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN] },
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ name: "asc" }],
    take: 50,
  })
}
