//lib/rbac.ts
export function canAccess(userPath: string, targetPath: string) {
  return targetPath === userPath || targetPath.startsWith(userPath + "/")
}

/**
 * Roles with system-wide visibility, exempt from org scoping.
 *
 * SUPER_ADMIN only. ADMIN is deliberately NOT exempt: it holds manage_users and
 * manage_wo_permissions, so it can open Accounts Management, and scoping it is
 * what stops a division administrator from administering (and, via grant_admin,
 * escalating) accounts in other regions.
 *
 * Kept system-wide for SUPER_ADMIN because it is the deployment's break-glass
 * account — scoping it would leave a deployment with no way to administer a unit
 * outside the superadmin's own branch.
 *
 * Note the asymmetry this leaves, which is structural rather than a bug: an admin
 * whose own org unit is the tree ROOT (Ethiopia) is scoped to that root, and the
 * root's subtree is the whole tree — so such an account still sees every user.
 * That is correct: its jurisdiction genuinely is the whole structure. Narrowing
 * it further means assigning it to a narrower org unit, not changing this rule.
 */
export function hasSystemScope(role: string): boolean {
  return role === "SUPER_ADMIN"
}

/**
 * May this role create (or promote) an account to SUPER_ADMIN?
 *
 * Restricted to SUPER_ADMIN itself. ADMIN holds `manage_users` and so can POST
 * /api/users, but that endpoint takes the role straight from the request body —
 * without this check an ADMIN could mint a SUPER_ADMIN, which is a full
 * escalation: the new account inherits `grant_admin` and `manage_permissions`
 * (so it can rewrite the permission matrix and mint more superadmins),
 * `system_settings`, system-wide org scope, and the exemption from the
 * first-login password gate that leaves it on whatever password was supplied.
 *
 * Mirrors the check the PATCH /api/users/[id] path already applies to role
 * changes, so both elevation routes now agree.
 */
export function canGrantSuperAdmin(role: string): boolean {
  return role === "SUPER_ADMIN"
}

/**
 * Prisma `where` fragment for a unit's subtree — the unit itself and everything
 * beneath it. The boundary is exact-or-"/" to match canAccess(): a bare
 * `startsWith(path)` would also match a sibling such as "…/cwr-section" when
 * scoping to "…/cwr" — in a permissions query that silently widens an
 * approver's reach into a neighbouring unit.
 */
export function orgSubtree(
  path: string,
): { OR: { path: string | { startsWith: string } }[] } {
  return { OR: [{ path }, { path: { startsWith: `${path}/` } }] }
}

/**
 * Prisma `where` fragment for the users inside a caller's org jurisdiction —
 * their own unit and everything beneath it. Returns `undefined` for system-wide
 * roles, which callers pass through as "no filter".
 *
 * The matrix: a field worker sits in the deputy-CEO branch (orgUnit) but
 * BELONGS to a department (departmentId), so jurisdiction follows either
 * affiliation — a department keeps its field workers in its own lists even
 * though they are not nested under it.
 *
 * Fails closed: a caller with no org unit gets a filter that matches nothing,
 * rather than an accidental system-wide list.
 */
export function usersInJurisdiction(
  caller: { role: string; orgUnit?: { path: string } | null },
):
  | {
      OR: [
        { orgUnit: { OR: { path: string | { startsWith: string } }[] } },
        { department: { OR: { path: string | { startsWith: string } }[] } },
      ]
    }
  | { id: string }
  | undefined {
  if (hasSystemScope(caller.role)) return undefined
  const path = caller.orgUnit?.path
  if (!path) return { id: "__no_org_unit__" }
  const subtree = orgSubtree(path)
  return { OR: [{ orgUnit: subtree }, { department: subtree }] }
}

/**
 * May `caller` administer `target`'s permission overrides? Used to enforce the
 * jurisdiction rule on the endpoints that act on a specific user by id — the
 * list being filtered is not, on its own, enforcement.
 *
 * Either of the target's affiliations inside the caller's subtree is enough:
 * where they sit, or the department they belong to.
 */
export function canAdministerUser(
  caller: { role: string; orgUnit?: { path: string } | null },
  target: { orgUnit?: { path: string } | null; department?: { path: string } | null },
): boolean {
  if (hasSystemScope(caller.role)) return true
  const callerPath = caller.orgUnit?.path
  if (!callerPath) return false
  if (target.orgUnit?.path && canAccess(callerPath, target.orgUnit.path)) return true
  return target.department?.path ? canAccess(callerPath, target.department.path) : false
}

export function canEdit(role: string) {
  return ["ADMIN", "SUPER_ADMIN", "DIRECTOR"].includes(role)
}

export function canUpload(role: string) {
  return [
    "SUPER_ADMIN",
    "ADMIN",
    "CHIEF",
    "DIRECTOR",
    "MANAGER",
    "SUPERVISOR",
    "USER"
  ].includes(role)
}