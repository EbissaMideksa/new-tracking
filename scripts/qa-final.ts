import prisma from '../lib/prisma'

async function main() {
  const [total, flagged] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { mustChangePassword: true } }),
  ])
  console.log('users:', total, 'forced-change-flagged:', flagged)
}
main().catch((e) => { console.error(e); process.exit(1) })
