import prisma from "../lib/prisma"
import { OrgType } from "../app/generated/prisma/enums"

async function main() {
  const office = await prisma.orgUnit.findFirst({ where: { type: OrgType.DEPUTY_CEO_OFFICE } })
  if (!office) throw new Error("No Deputy CEO Office found")

  const prefix = office.path + "/"
  const source = (
    await prisma.orgUnit.findMany({ where: { path: { startsWith: prefix } } })
  ).sort((a, b) => a.path.split("/").length - b.path.split("/").length) // parents first

  const departments = await prisma.orgUnit.findMany({ where: { type: OrgType.DEPARTMENT } })
  let created = 0

  for (const dept of departments) {
    const idByPath = new Map<string, string>([[dept.path, dept.id]])
    for (const n of source) {
      const rel = n.path.slice(prefix.length)
      const path = `${dept.path}/${rel}`
      const parentPath = path.slice(0, path.lastIndexOf("/"))
      const parentId = idByPath.get(parentPath)
      if (!parentId) continue

      const existing = await prisma.orgUnit.findUnique({ where: { path } })
      if (existing) { idByPath.set(path, existing.id); continue }

      const row = await prisma.orgUnit.create({
        data: { name: n.name, type: n.type, code: n.code, parentId, path },
      })
      idByPath.set(path, row.id)
      created++
    }
  }
  console.log(`✅ mirrored ${created} node(s) under ${departments.length} departments`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())

