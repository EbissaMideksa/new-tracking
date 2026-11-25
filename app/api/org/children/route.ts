
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const basePath = user.orgUnit.path

  const children = await prisma.orgUnit.findMany({
    where: {
      parentId: user.orgUnitId
    },
    orderBy: {
      name: "asc"
    }
  })

  return NextResponse.json(children)
}