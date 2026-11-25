
// app/dashboard/layout.tsx
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { mustChangeOnFirstLogin } from "@/lib/defaultPassword"
import DashboardShell from "@/components/DashboardShell"
import ToastProvider from "@/components/ToastProvider"
import ConfirmProvider from "@/components/ConfirmProvider"
import AlertProvider from "@/components/AlertProvider"
import { BreadcrumbProvider } from "@/context/BreadcrumbContext"
import { PermissionsProvider } from "@/context/PermissionsContext"
import { WoPermissionsProvider } from "@/context/WoPermissionsContext"
import { ThemeProvider } from "@/context/ThemeContext"

export default async function DashboardLayout({ children }: any) {
  const user = await getCurrentUser()
  if (!user) return <div>Unauthorized</div>

  // Accounts still on the built-in default password may only reach the change
  // screen. proxy.ts already redirects these requests; this DB-backed check is
  // the authoritative one and additionally catches a flag set by an admin after
  // this session started (getCurrentUser caches for 30s and
  // PATCH /api/settings/password invalidates it). SUPER_ADMIN is exempt — see
  // lib/defaultPassword.ts.
  if (user.mustChangePassword && mustChangeOnFirstLogin(user.role)) {
    redirect("/change-password")
  }

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AlertProvider>
          <BreadcrumbProvider>
            <PermissionsProvider>
              <WoPermissionsProvider>
                <ThemeProvider>
                  <DashboardShell user={user}>{children}</DashboardShell>
                </ThemeProvider>
              </WoPermissionsProvider>
            </PermissionsProvider>
          </BreadcrumbProvider>
        </AlertProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
