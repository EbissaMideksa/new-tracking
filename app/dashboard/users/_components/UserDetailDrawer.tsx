// app/dashboard/users/_components/UserDetailDrawer.tsx
//
// Slide-over holding everything the table does not show — the columns behind
// the visibility toggle plus the fields with no column at all. Same Esc /
// backdrop convention as components/OrgStructureModal.tsx.
"use client"

import {
  type User,
  type OrgNode,
  sectionFor,
  departmentFor,
  regionZoneSiteFor,
  statusOf,
  STATUS_STYLES,
  fmtDate,
  fmtDateTime,
  fmtRelative,
} from "./userColumns"
import Modal from "@/components/Modal"

type Props = {
  user: User
  /** root → user's org unit, from buildAncestry(); drives Section + location. */
  chain?: OrgNode[]
  onClose: () => void
  onEdit: () => void
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 16,
      padding: "7px 0", borderBottom: "1px solid #f1f5f9",
    }}>
      <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{
        fontSize: 12, color: "#0f172a", textAlign: "right", fontWeight: 600,
        fontFamily: mono ? "monospace" : undefined, overflowWrap: "anywhere",
      }}>{value}</span>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
        color: "#94a3b8", marginBottom: 4,
      }}>{title}</div>
      {children}
    </section>
  )
}

export default function UserDetailDrawer({ user, chain, onClose, onEdit }: Props) {
  const status = statusOf(user)
  const chip = STATUS_STYLES[status] ?? STATUS_STYLES.ACTIVE

  return (
    <Modal
      open
      onClose={onClose}
      title={user.name}
      size="md"
      footer={
        <>
          <button onClick={onClose} style={{
            background: "#fff", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6,
            padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Close</button>
          <button onClick={onEdit} style={{
            background: "#2563eb", color: "#fff", border: "none", borderRadius: 6,
            padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Edit user</button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
          background: "#f1f5f9", color: "#475569",
        }}>{user.role}</span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
          background: chip.bg, color: chip.fg, border: `1px solid ${chip.bd}`,
        }}>{status}</span>
        {user.mustChangePassword && (
          <span title="Still on the default password — must change it at next login" style={{
            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
            background: "#fef3c7", color: "#92400e",
          }}>default pw</span>
        )}
      </div>

      {/* ── Identity ── */}
      <Group title="Identity">
        <Row label="Email" value={user.email} />
        <Row label="Phone" value={user.phone || "—"} />
        <Row label="Oracle ID" value={user.employeeId || "—"} mono />
        <Row label="Job Title" value={user.jobTitle || "—"} />
        <Row label="Section" value={sectionFor(user, chain)} />
      </Group>

      {/* ── Org & scoping ── */}
      <Group title="Org & scoping">
        <Row label="Org Unit" value={user.orgUnit ? `${user.orgUnit.name} (${user.orgUnit.type})` : "—"} />
        <Row label="Department" value={departmentFor(user, chain)} />
        <Row label="Region / Zone / Site" value={regionZoneSiteFor(chain)} />
        <Row label="Reports To" value={user.manager ? `${user.manager.name} · ${user.manager.role ?? ""}` : "—"} />
      </Group>

      {/* ── Workload ── */}
      <Group title="Workload">
        <Row label="Assigned assets" value={user._count?.assignedAssets ?? "—"} />
        <Row label="Open work orders" value={user._count?.assignedWorkOrders ?? "—"} />
      </Group>

      {/* ── Security & audit ── */}
      <Group title="Security & audit">
        <Row label="Last login" value={user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : "Never"} />
        <Row label=" " value={<span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>
          {fmtRelative(user.lastLoginAt)}
        </span>} />
        <Row label="Created / joined" value={fmtDate(user.createdAt)} />
        <Row label="Account status" value={status} />
      </Group>
    </Modal>
  )
}
