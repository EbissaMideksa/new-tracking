import prisma from "../lib/prisma"
import bcrypt from "bcryptjs"
import {
  DEFAULT_PASSWORD,
  PASSWORD_MIN_LENGTH,
} from "../lib/defaultPassword"

async function main() {
  const newPassword = process.env.SEED_ADMIN_PASSWORD

  if (!newPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Refusing to reset the password."
    )
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`
    )
  }

  if (newPassword.toLowerCase().includes("admin123")) {
    throw new Error(
      "The password must not contain the old default password."
    )
  }

  if (newPassword === DEFAULT_PASSWORD) {
    throw new Error(
      "Choose a new password instead of the default password."
    )
  }

  const email = "super@track.com"

  // Confirm that the account exists and is actually a Super Admin.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
    },
  })

  if (!existingUser) {
    throw new Error(
      `Account ${email} does not exist. No password was changed.`
    )
  }

  if (existingUser.role !== "SUPER_ADMIN") {
    throw new Error(
      `Account ${email} is not a SUPER_ADMIN. No password was changed.`
    )
  }

  // Hash the password before saving it.
  const hashedPassword = await bcrypt.hash(newPassword, 12)

  // Update only this account. Do not modify other users.
  await prisma.user.update({
    where: { email },
    data: {
      password: hashedPassword,
      mustChangePassword: true,
    },
  })

  console.log("Super Admin password reset successfully.")
  console.log(`Account: ${email}`)
  console.log("The account must change its password if your application")
  console.log("enforces the mustChangePassword flag at login.")
}

main()
  .catch((error) => {
    console.error("Password reset failed:", error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

