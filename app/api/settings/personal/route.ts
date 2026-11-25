
// app/api/settings/personal/route.ts
//
// Saves name / phone / photo.
// Storage strategy is determined by PHOTO_STORAGE env var:
//   "local"     → /public/uploads/avatars  (dev/small deployments)
//   "s3"        → AWS S3 / compatible (R2, MinIO)  ← RECOMMENDED for production
//   "supabase"  → Supabase Storage
//
// The upload helpers are isolated so you can swap one out without touching
// the rest of the handler.

import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, invalidateCurrentUser } from "@/lib/auth"
import prisma                        from "@/lib/prisma"
import { publish }                   from "@/lib/broadcast"
import { createAuditLog }            from "@/lib/audit"
import { uploadPhoto, deletePhoto }  from "@/lib/storage"   // ← NEW unified helper

export async function PATCH(req: NextRequest) {
  try {
    const me = await getCurrentUser()
    if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const fd     = await req.formData()
    const userId = fd.get("userId") as string
    const name   = (fd.get("name")  as string | null)?.trim()
    const phone  = (fd.get("phone") as string | null)?.trim() ?? null
    const photo  = fd.get("photo") as File | null

    if (me.id !== userId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 })

    // ── Photo validation ──────────────────────────────────────────────────────
    let photoUrl: string | undefined
    if (photo && photo.size > 0) {
      const allowed = ["image/jpeg", "image/png", "image/webp"]
      if (!allowed.includes(photo.type))
        return NextResponse.json({ error: "Use JPG, PNG, or WebP." }, { status: 400 })
      if (photo.size > 4 * 1024 * 1024)
        return NextResponse.json({ error: "Image must be under 4 MB." }, { status: 400 })

      // ── Delete old photo if one exists (avoids orphaned files) ────────────
      const current = await prisma.user.findUnique({
        where: { id: userId }, select: { photo: true },
      })
      if (current?.photo) {
        await deletePhoto(current.photo).catch(err =>
          // Non-fatal — log and continue
          console.warn("[api/settings/personal] Could not delete old photo:", err)
        )
      }

      // ── Upload new photo ──────────────────────────────────────────────────
      photoUrl = await uploadPhoto(photo, userId)
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    const updated = await prisma.user.update({
      where:  { id: userId },
      data:   { name, phone: phone || null, ...(photoUrl ? { photo: photoUrl } : {}) },
      select: { id: true, name: true, phone: true, photo: true, email: true },
    })

    // Invalidate the cached user so the new name/photo shows immediately.
    await invalidateCurrentUser(userId)

    // ── Broadcast to all connected browser tabs ───────────────────────────────
    await publish(`user:${userId}`, {
      type:  "PROFILE_UPDATED",
      name:  updated.name,
      photo: updated.photo,
      phone: updated.phone,
    })

    await createAuditLog({
      performedById: userId,
      action: `Updated profile (${updated.name})`,
      actionType: "USER_MANAGEMENT",
      targetUserName: updated.name,
      targetUserEmail: updated.email,
    })
    publish("audit", { event: "invalidate" })

    return NextResponse.json({ user: updated })
  } catch (err: any) {
    console.error("[api/settings/personal]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

