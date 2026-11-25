
// app/dashboard/(workorders)/layout.tsx

// No AdvancedSidebar — workorders page has its own chrome.
// WoPermissionsProvider is NOT re-added here: the parent dashboard layout
// already provides it, and a second instance would open a duplicate SSE
// to /api/admin/wo-permissions/events. Combined with the other always-on
// SSEs on this route that duplicate was enough to saturate the browser's
// 6-connection HTTP/1.1 limit and stall the monitoring fetch.
export default function WorkOrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", width:"100%", overflow:"hidden" }}>
      {children}
    </div>
  )
}
