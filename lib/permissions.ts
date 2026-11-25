
// lib/permissions.ts
import prisma from "@/lib/prisma"
import { DEFAULT_GRANT_MATRIX, GrantMatrix } from "@/lib/adminGrants"

export async function loadPermissionsFromDB(): Promise<GrantMatrix> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "grant_matrix" },
    })

    if (!setting?.value) return { ...DEFAULT_GRANT_MATRIX }

    const matrix = JSON.parse(setting.value) as GrantMatrix
    // Always enforce SUPER_ADMIN immutability
    matrix["SUPER_ADMIN"] = [...DEFAULT_GRANT_MATRIX["SUPER_ADMIN"]]
    return matrix
  } catch (err) {
    console.error("[permissions] DB load failed, using defaults:", err)
    return { ...DEFAULT_GRANT_MATRIX }
  }
}

export async function savePermissionsToDB(matrix: GrantMatrix): Promise<void> {
  matrix["SUPER_ADMIN"] = [...DEFAULT_GRANT_MATRIX["SUPER_ADMIN"]]

  await prisma.systemSetting.upsert({
    where:  { key: "grant_matrix" },
    update: { value: JSON.stringify(matrix) },
    create: { key: "grant_matrix", value: JSON.stringify(matrix) },
  })
}
