// lib/enums.ts
//
// SQLite has no native enums, so the Prisma schema stores these as plain String
// columns. These constants are the canonical value sets, and the same-name type
// aliases keep the rest of the codebase (which used to import the generated
// Prisma enums) type-checking unchanged.

export const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  CHIEF: "CHIEF",
  DIRECTOR: "DIRECTOR",
  MANAGER: "MANAGER",
  SUPERVISOR: "SUPERVISOR",
  USER: "USER",
} as const
export type Role = string

export const OrgType = {
  COUNTRY: "COUNTRY",
  DIVISION: "DIVISION",
  DEPARTMENT: "DEPARTMENT",
  DEPUTY_CEO_OFFICE: "DEPUTY_CEO_OFFICE",
  CATEGORY: "CATEGORY",
  CORPORATE: "CORPORATE",
  REGION: "REGION",
  ZONE: "ZONE",
  SECTION: "SECTION",
  GROUP: "GROUP",
  AREA: "AREA",
  SITE: "SITE",
} as const
export type OrgType = string

export const OrgNodeKind = {
  CORPORATE: "CORPORATE",
  DIVISION: "DIVISION",
  DEPARTMENT: "DEPARTMENT",
  SECTION: "SECTION",
  GROUP: "GROUP",
  LOCAL_UNIT: "LOCAL_UNIT",
} as const
export type OrgNodeKind = string

export const GeoCategory = {
  ADDIS_ABABA: "ADDIS_ABABA",
  REGION: "REGION",
} as const
export type GeoCategory = string