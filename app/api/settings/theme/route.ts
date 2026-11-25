// app/api/settings/theme/route.ts
// Public endpoint — returns the global default theme ("light" | "dark")
// stored under the SystemSetting key "theme". Readable by any authenticated
// user so the ThemeProvider can apply the org-wide default.

import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getSetting } from "@/lib/systemSettings"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [rawTheme, rawSiteName] = await Promise.all([
    getSetting("theme"),
    getSetting("site_name"),
  ])
  const theme = rawTheme === "dark" ? "dark" : "light"
  return NextResponse.json({ theme, siteName: rawSiteName || "Asset System" })
}
