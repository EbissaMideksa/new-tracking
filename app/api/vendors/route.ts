// app/api/vendors/route.ts
// CRUD for vendors/suppliers.

import prisma from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { broadcast } from "@/lib/broadcast"
import { createAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const vendors = await prisma.vendor.findMany({
    include: { _count: { select: { assets: true } } },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(vendors)
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  if (!body.name) return NextResponse.json({ error: "Name required" }, { status: 400 })

  const vendor = await prisma.vendor.create({
    data: {
      name: body.name,
      contactName: body.contactName || null,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      notes: body.notes || null,
    },
  })

  await createAuditLog({
    performedById: user.id,
    action: `Created vendor: ${body.name}`,
    actionType: "SETTINGS",
  })

  broadcast("audit", { event: "invalidate" })
  return NextResponse.json(vendor, { status: 201 })
}
