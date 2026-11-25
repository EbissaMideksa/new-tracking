// ─────────────────────────────────────────────────────────────────────────────
// lib/storage.ts
// Local filesystem storage (no S3/MinIO). Files are written under public/uploads
// and served directly by Next.js; relative paths are stored in the DB.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFile, mkdir, unlink } from "fs/promises"
import path from "path"

export async function uploadPhoto(file: File, userId: string): Promise<string> {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }
  const ext = mimeToExt[file.type]
  if (!ext) throw new Error(`Unsupported image type: ${file.type}`)

  const filename = `${userId}-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars")
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, filename), buffer)
  return `/uploads/avatars/${filename}`
}

export async function deletePhoto(url: string): Promise<void> {
  if (!url) return
  if (!url.startsWith("/uploads/")) return
  const filePath = path.join(process.cwd(), "public", url)
  await unlink(filePath).catch(() => {})
}

// Kept for API compatibility with the /storage/avatars route. In local mode the
// files are served statically from public/uploads, so this simply 404s.
export async function streamPhoto(_key: string): Promise<never> {
  throw new Error("streamPhoto() is not available in local storage mode.")
}