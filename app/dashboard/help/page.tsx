"use client"

import { useEffect, useState } from "react"

export default function HelpPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch("/api/settings/theme").then(r => r.json()).then(d => {
      if (d.siteName) setSettings({ site_name: d.siteName })
    }).catch(() => {})
  }, [])

  const features = [
    { icon: "📦", name: "Asset Management", items: "CRUD, upload, search, assign, tag edit, photos, QR labels, categories, custom fields, checkout, retirement, depreciation, warranty tracking, bulk operations" },
    { icon: "🔧", name: "Work Orders", items: "Create, assign, checkout, start, complete, checkin, delete, templates, SLA tracking, comments, time tracking, cost tracking, email notifications" },
    { icon: "📊", name: "Monitoring & Reports", items: "Dashboard KPIs, analytics, PDF/Excel/CSV export, inventory count, activity feed, notification bell" },
    { icon: "🗺️", name: "Organization", items: "Hierarchical org tree, role-based permissions, WO permissions, vendor management, location grouping" },
    { icon: "⏰", name: "Maintenance", items: "Preventive maintenance scheduling, auto-generate WOs, maintenance templates" },
    { icon: "🔗", name: "Integrations", items: "External API with keys, PWA manifest, global search, SSE live updates" },
  ]

  const guides = [
    { title: "Adding a new asset", steps: ["Dashboard → Assets → Upload (Excel) or add manually", "Open asset detail → upload photo, fill custom fields", "Generate QR label → print → affix to equipment", "Create maintenance schedule if needed"] },
    { title: "Creating a work order", steps: ["Dashboard → Work Orders → New Work Order", "Select a template (optional) or enter title/description", "Select org unit and priority", "Click Create → assign to team"] },
    { title: "Performing inventory count", steps: ["Dashboard → Inventory (or /dashboard/inventory)", "Search for assets by tag/serial", "Mark each as Found/Missing/Uncertain", "Check stats bar for progress"] },
    { title: "Retiring an asset", steps: ["Open asset detail page", "Click 'Retire / Dispose Asset'", "Select reason and disposal method", "Confirm — asset marked inactive"] },
    { title: "Setting up API integration", steps: ["Dashboard → API Keys (admin only)", "Generate a key with a name", "Copy the key (shown once)", "Use X-API-Key header in external system calls"] },
  ]

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Help & About</h1>
        <p className="text-sm text-gray-500 mt-1">
          {settings.site_name || "Asset Tracking"} — Ethio Telecom Asset Management System
        </p>
      </div>

      {/* About */}
      <div className="bg-white p-5 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-3">About This System</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Version:</span> 1.0.0</div>
          <div><span className="text-gray-500">Framework:</span> Next.js 16 (Turbopack)</div>
          <div><span className="text-gray-500">Database:</span> PostgreSQL 16</div>
          <div><span className="text-gray-500">Cache:</span> Redis 7</div>
          <div><span className="text-gray-500">Proxy:</span> Nginx (TLS, rate limiting)</div>
          <div><span className="text-gray-500">Monitoring:</span> Prometheus + Grafana + Loki</div>
          <div><span className="text-gray-500">CI/CD:</span> GitHub Actions + blue/green</div>
          <div><span className="text-gray-500">Deploy:</span> Zero-downtime with instant rollback</div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-white p-5 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-3">Features</h2>
        <div className="space-y-3">
          {features.map((f, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-2xl">{f.icon}</span>
              <div>
                <h3 className="text-sm font-semibold">{f.name}</h3>
                <p className="text-xs text-gray-500">{f.items}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Guides */}
      <div className="bg-white p-5 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-3">Quick Guides</h2>
        <div className="space-y-4">
          {guides.map((g, i) => (
            <div key={i}>
              <h3 className="text-sm font-semibold mb-1">{g.title}</h3>
              <ol className="text-xs text-gray-500 ml-4 list-decimal space-y-1">
                {g.steps.map((s, j) => <li key={j}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {/* Pages reference */}
      <div className="bg-white p-5 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-3">Available Pages</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <a href="/dashboard" className="text-blue-600 hover:underline">Dashboard</a>
          <a href="/dashboard/assets" className="text-blue-600 hover:underline">Assets</a>
          <a href="/dashboard/workorders" className="text-blue-600 hover:underline">Work Orders</a>
          <a href="/dashboard/users" className="text-blue-600 hover:underline">User Management</a>
          <a href="/dashboard/analytics" className="text-blue-600 hover:underline">Analytics</a>
          <a href="/dashboard/audit" className="text-blue-600 hover:underline">Audit Log</a>
          <a href="/dashboard/maintenance" className="text-blue-600 hover:underline">Maintenance Schedules</a>
          <a href="/dashboard/vendors" className="text-blue-600 hover:underline">Vendors</a>
          <a href="/dashboard/inventory" className="text-blue-600 hover:underline">Inventory Count</a>
          <a href="/dashboard/locations" className="text-blue-600 hover:underline">Asset Locations</a>
          <a href="/dashboard/api-keys" className="text-blue-600 hover:underline">API Keys (admin)</a>
          <a href="/dashboard/settings" className="text-blue-600 hover:underline">System Settings (admin)</a>
        </div>
      </div>

      {/* Support */}
      <div className="bg-gray-50 p-5 rounded-lg border">
        <h2 className="text-lg font-bold mb-2">Support</h2>
        <p className="text-sm text-gray-500">
          For technical support, check the Grafana dashboards at localhost:3001 for system health,
          or search logs in Loki (Grafana → Explore → Loki). For deployment issues, use
          <code className="bg-gray-200 px-1 rounded mx-1">make health</code> and
          <code className="bg-gray-200 px-1 rounded mx-1">make logs s=app-blue</code>.
        </p>
      </div>
    </div>
  )
}
