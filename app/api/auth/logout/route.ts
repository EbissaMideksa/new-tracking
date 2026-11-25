
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { publish } from "@/lib/broadcast"

export async function POST() {
  const user = await getCurrentUser()

  if (user) {
    await createAuditLog({
      performedById: user.id,
      action: `User logged out (${user.email})`,
      actionType: "AUTH",
      targetUserName: user.name,
      targetUserEmail: user.email,
    })
    publish("audit", { event: "invalidate" })
  }

  const res = NextResponse.json({ success: true })

  res.cookies.set("token", "", {
    expires: new Date(0),
    path: "/"
  })

  return res
}
