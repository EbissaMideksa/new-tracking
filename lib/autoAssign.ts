
// lib/autoAssign.ts
import prisma from "@/lib/prisma"

type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "CHIEF"
  | "DIRECTOR"
  | "MANAGER"
  | "SUPERVISOR"
  | "USER"

export async function autoAssignUser(orgUnitId: string) {
  const org = await prisma.orgUnit.findUnique({
    where: { id: orgUnitId }
  })

  if (!org) return null

  const rolePriorityMap: Record<string, UserRole[]> = {
    SITE:       ["USER"],
    AREA:       ["SUPERVISOR", "USER"],
    GROUP:      ["SUPERVISOR", "USER"],
    SECTION:    ["MANAGER"],
    ZONE:       ["DIRECTOR"],
    REGION:     ["DIRECTOR"],
    CORPORATE:  ["MANAGER"],
    DEPARTMENT: ["DIRECTOR"],
    DIVISION:   ["CHIEF"],
  }

  const roles = rolePriorityMap[org.type] ?? ["USER"]

  for (const role of roles) {
    const users = await prisma.user.findMany({
      where: {
        role,
        orgUnit: {
          path: {
            startsWith: org.path
          }
        }
      }
    })

    if (!users.length) continue

    const withLoad = await Promise.all(
      users.map(async (u) => {
        const load = await prisma.workOrder.count({
          where: {
            assignedToId: u.id,
            status: {
              in: ["ASSIGNED", "CHECKED_OUT", "IN_PROGRESS"]
            }
          }
        })

        return {
          ...u,
          load
        }
      })
    )

    withLoad.sort((a, b) => a.load - b.load)

    return withLoad[0]
  }

  return null
}
