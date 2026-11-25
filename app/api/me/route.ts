
// app/api/me/route.ts
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { loadUserOverrides } from "@/lib/userPermissions"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const overrides = await loadUserOverrides(user.id)

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    photo: user.photo,
    orgUnit: user.orgUnit,
    overrides, // { admin: {granted,revoked}, wo: {granted,revoked} } — new
  })
}

