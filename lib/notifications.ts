// lib/notifications.ts
// Sends email notifications for work order events.
// Reads notification settings from the database to determine which events trigger emails.
// Uses the SMTP config from environment variables (GF_SMTP_* — same as Grafana).

import { getSetting } from "@/lib/systemSettings"
import prisma from "@/lib/prisma"

interface EmailPayload {
  to: string
  subject: string
  body: string
}

async function sendEmail({ to, subject, body }: EmailPayload): Promise<boolean> {
  const smtpHost = process.env.GF_SMTP_HOST
  const smtpUser = process.env.GF_SMTP_USER
  const smtpPass = process.env.GF_SMTP_PASSWORD

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log("[notifications] SMTP not configured — skipping email")
    return false
  }

  try {
    const boundary = "boundary_" + Math.random().toString(36).slice(2)
    const response = await fetch(`https://${smtpHost}/smtp/send`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Authorization": "Basic " + Buffer.from(`${smtpUser}:${smtpPass}`).toString("base64"),
      },
      body: `--${boundary}\r\nContent-Disposition: form-data; name="to"\r\n\r\n${to}\r\n--${boundary}\r\nContent-Disposition: form-data; name="subject"\r\n\r\n${subject}\r\n--${boundary}\r\nContent-Disposition: form-data; name="text"\r\n\r\n${body}\r\n--${boundary}--\r\n`,
    })
    return response.ok
  } catch (err) {
    console.error("[notifications] email send failed:", err)
    return false
  }
}

export async function notifyWoAssignment(workOrder: any, assignedUser: any, performedBy: any) {
  const enabled = await getSetting("notify_on_wo_assignment")
  if (enabled !== "true") return

  if (!assignedUser?.email) return

  await sendEmail({
    to: assignedUser.email,
    subject: `Work Order Assigned: ${workOrder.workOrderNo || workOrder.id.slice(0, 8)}`,
    body: [
      `A work order has been assigned to you.`,
      ``,
      `Work Order: ${workOrder.workOrderNo || workOrder.id.slice(0, 8)}`,
      `Title: ${workOrder.title || "Untitled"}`,
      `Priority: ${workOrder.priority || "MEDIUM"}`,
      `Status: ${workOrder.status}`,
      `Assigned by: ${performedBy?.name || "System"}`,
      ``,
      `Please log in to the Asset Tracking system to view details.`,
    ].join("\n"),
  })
}

export async function notifyWoStatusChange(workOrder: any, newStatus: string, performedBy: any) {
  const enabled = await getSetting("notify_on_wo_status_change")
  if (enabled !== "true") return

  const recipients: string[] = []
  if (workOrder.assignedTo?.email) recipients.push(workOrder.assignedTo.email)
  if (workOrder.createdBy?.email && workOrder.createdBy.email !== workOrder.assignedTo?.email) {
    recipients.push(workOrder.createdBy.email)
  }

  for (const email of recipients) {
    await sendEmail({
      to: email,
      subject: `Work Order ${newStatus}: ${workOrder.workOrderNo || workOrder.id.slice(0, 8)}`,
      body: [
        `Work order status has changed.`,
        ``,
        `Work Order: ${workOrder.workOrderNo || workOrder.id.slice(0, 8)}`,
        `Title: ${workOrder.title || "Untitled"}`,
        `New Status: ${newStatus}`,
        `Updated by: ${performedBy?.name || "System"}`,
        ``,
        `Please log in to the Asset Tracking system to view details.`,
      ].join("\n"),
    })
  }
}
