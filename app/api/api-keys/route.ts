// app/api/api-keys/route.ts
// Manage API keys (admin only).

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAuditLog } from "@/lib/audit"
import { hashApiKey } from "@/lib/apiKeyAuth"
import crypto from "crypto"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const keys = await prisma.apiKey.findMany({
    select: { id: true, name: true, active: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(keys)
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  if (!body.name) return NextResponse.json({ error: "Name required" }, { status: 400 })

  const key = "et_" + crypto.randomBytes(24).toString("hex")

  // Only the hash is persisted — `key` (the plaintext column) is deliberately
  // left NULL. The raw value below is the one and only time it is available.
  const apiKey = await prisma.apiKey.create({
    data: {
      keyHash: hashApiKey(key),
      name: body.name,
      createdById: user.id,
    },
  })

  await createAuditLog({
    performedById: user.id,
    action: `Created API key: ${body.name}`,
    actionType: "SETTINGS",
  })

  return NextResponse.json(
    { id: apiKey.id, name: apiKey.name, key, createdAt: apiKey.createdAt },
    { status: 201 },
  )
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  await prisma.apiKey.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ success: true })
}
