
// components/settings/PersonalInfoForm.tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { Camera, Upload, Save, CheckCircle, AlertCircle, Loader2, X } from "lucide-react"
import { CameraModal } from "@/components/CameraModal"

interface Props {
  user: {
    id: string
    name: string
    email: string
    phone: string
    photo: string | null
    orgUnit: { name: string; type: string } | null
    role: string
  }
}

// ─── tiny helper ─────────────────────────────────────────────────────────────
function initials(n: string) {
  return n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "U"
}

// ─── Main Form ────────────────────────────────────────────────────────────────
export default function PersonalInfoForm({ user }: Props) {
  const [name,        setName]        = useState(user.name)
  const [phone,       setPhone]       = useState(user.phone)
  const [preview,     setPreview]     = useState<string | null>(user.photo)
  const [photoFile,   setPhotoFile]   = useState<File | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [msg,         setMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showCamera,  setShowCamera]  = useState(false)
  const [sourceMenu,  setSourceMenu]  = useState(false)
  const [lightbox, setLightbox] = useState(false)

  // Is the current browser likely a mobile device?
  const isMobile = typeof window !== "undefined" &&
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)

  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /**
   * Holds the live MediaStream while the webcam modal is open.
   * Stored at this level so handleSave can kill the hardware tracks directly,
   * without waiting for React's async unmount cleanup.
   */
  const activeCameraStream = useRef<MediaStream | null>(null)

  // Close source menu when clicking outside
useEffect(() => {
  function handler(e: MouseEvent) {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setSourceMenu(false)
    }
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { setLightbox(false); setSourceMenu(false) }
  }
  document.addEventListener("mousedown", handler)
  document.addEventListener("keydown", onKeyDown)
  return () => {
    document.removeEventListener("mousedown", handler)
    document.removeEventListener("keydown", onKeyDown)
  }
}, [])

  function validateAndSetFile(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      setMsg({ type: "error", text: "Image must be under 4 MB." }); return
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMsg({ type: "error", text: "Only JPG, PNG or WebP allowed." }); return
    }
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
    setMsg(null)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndSetFile(file)
  }

  function onCameraCapture(file: File, previewUrl: string) {
    setPhotoFile(file)
    setPreview(previewUrl)
    setShowCamera(false)
    setMsg(null)
  }

  function openUpload() {
    setSourceMenu(false)
    fileRef.current?.click()
  }

  function openCamera() {
    setSourceMenu(false)
    // On mobile, the native camera input is smoother than getUserMedia
    if (isMobile) {
      mobileFileRef.current?.click()
    } else {
      setShowCamera(true)
    }
  }

  const mobileFileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    // ── Kill camera hardware immediately, before anything async runs ──────────
    // This releases the browser's camera indicator light right away and
    // ensures the stream is dead whether or not the modal is still mounted.
    if (activeCameraStream.current) {
      activeCameraStream.current.getTracks().forEach(t => t.stop())
      activeCameraStream.current = null
    }
    setShowCamera(false)   // close modal UI if somehow still open
    if (!name.trim()) { setMsg({ type: "error", text: "Name is required." }); return }
    setLoading(true); setMsg(null)
    try {
      const fd = new FormData()
      fd.append("userId", user.id)
      fd.append("name",   name.trim())
      fd.append("phone",  phone.trim())
      if (photoFile) fd.append("photo", photoFile)

      const res  = await fetch("/api/settings/personal", { method: "PATCH", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to save")

      setMsg({ type: "success", text: "Profile updated successfully." })
      setPhotoFile(null)

      window.dispatchEvent(
        new CustomEvent("user:updated", {
          detail: { name: name.trim(), photo: data.user?.photo ?? preview },
        })
      )
    } catch (err: any) {
      setMsg({ type: "error", text: err.message })
    } finally {
      setLoading(false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 13,
    border: "1px solid #e2e8f0", borderRadius: 7,
    background: "#f8fafc", color: "#0f172a",
    outline: "none", transition: "border-color 0.15s, box-shadow 0.15s",
    fontFamily: "inherit",
  }
  const inputDisabledStyle: React.CSSProperties = {
    ...inputStyle, background: "#f1f5f9", color: "#94a3b8", cursor: "not-allowed",
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "#64748b", marginBottom: 5, display: "block",
  }

  return (
    <div>
      {/* ── CAMERA MODAL ── */}
      {showCamera && (
        <CameraModal
          activeStreamRef={activeCameraStream}
          onCapture={onCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

{/* ── PHOTO LIGHTBOX ── */}
{lightbox && preview && (
  <div
    onClick={() => setLightbox(false)}
    style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.18s ease", cursor: "pointer",
    }}
  >
    <div
      onClick={e => e.stopPropagation()}
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 12,
        boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 10,
        animation: "lightboxPop 0.2s cubic-bezier(0.34,1.56,0.64,1)",
        maxWidth: "min(360px, 90vw)",
        width: "100%",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingBottom: 8, borderBottom: "1px solid #f1f5f9",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Profile Photo</span>
        <button
          onClick={() => setLightbox(false)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#94a3b8", display: "flex", padding: 2, borderRadius: 4,
            transition: "color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#334155"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#94a3b8"}
        >
          <X size={16} />
        </button>
      </div>

      {/* Image */}
      <img
        src={preview}
        alt="Profile photo"
        style={{
          width: "100%",
          aspectRatio: "1/1",
          objectFit: "cover",
          borderRadius: 10,
          display: "block",
        }}
      />
    </div>
  </div>
)}
      {/* ── AVATAR ROW ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "16px 18px", background: "#f8fafc",
        border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 22,
      }}>
        {/* Avatar */}
        
        {/* Avatar — click to enlarge if photo exists, otherwise open menu */}
<div
  onClick={() => preview ? setLightbox(true) : setSourceMenu(v => !v)}
  title={preview ? "Click to enlarge" : "Click to change photo"}
  style={{
    width: 68, height: 68, borderRadius: "50%",
    background: "#eff6ff", border: "2px solid #bfdbfe",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", cursor: "pointer", flexShrink: 0,
    transition: "border-color 0.15s",
  }}
  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "#2563eb"}
  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "#bfdbfe"}
>
  {preview ? (
    <img src={preview} alt="avatar"
      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <span style={{ fontSize: 20, fontWeight: 700, color: "#2563eb" }}>{initials(name)}</span>
  )}
</div>


        {/* Source selector */}
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 2 }}>Profile Photo</p>
          <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>JPG, PNG or WebP · max 4 MB</p>

          {/* Dropdown trigger */}
          <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
            <button
              onClick={() => setSourceMenu(v => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6,
                border: "1px solid #e2e8f0", background: "#fff", color: "#475569",
                cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f1f5f9"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff"}
            >
              <Camera size={13} />
              {preview ? "Change Photo" : "Add Photo"}
              <span style={{
                fontSize: 10, marginLeft: 2,
                transform: sourceMenu ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
                display: "inline-block",
              }}>▾</span>
            </button>

            {/* Dropdown menu */}
            {sourceMenu && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9,
                boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                overflow: "hidden", minWidth: 180,
                animation: "fadeIn 0.1s ease",
              }}>
                <button
                  onClick={openUpload}
                  style={{
                    width: "100%", padding: "10px 14px",
                    display: "flex", alignItems: "center", gap: 10,
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 13, color: "#334155", textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f8fafc"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: "#eff6ff", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    color: "#2563eb", flexShrink: 0,
                  }}>
                    <Upload size={13} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>Upload File</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>From your device</div>
                  </div>
                </button>

                <div style={{ height: 1, background: "#f1f5f9", margin: "0 10px" }} />

                <button
                  onClick={openCamera}
                  style={{
                    width: "100%", padding: "10px 14px",
                    display: "flex", alignItems: "center", gap: 10,
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 13, color: "#334155", textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f8fafc"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: "#fef3c7", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    color: "#d97706", flexShrink: 0,
                  }}>
                    <Camera size={13} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      {isMobile ? "Take Photo" : "Use Webcam"}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      {isMobile ? "Open camera app" : "Live camera capture"}
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hidden file inputs */}
        {/* Regular file upload */}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={onFileChange}
        />
        {/* Mobile native camera capture */}
        <input
          ref={mobileFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          style={{ display: "none" }}
          onChange={onFileChange}
        />
      </div>

      {/* ── ALERT ── */}
      {msg && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 18,
          background: msg.type === "success" ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${msg.type === "success" ? "#bbf7d0" : "#fecaca"}`,
          color: msg.type === "success" ? "#16a34a" : "#dc2626",
          animation: "fadeIn 0.2s ease",
        }}>
          {msg.type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {msg.text}
        </div>
      )}

      {/* ── FIELDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
        <div>
          <label style={labelStyle}>Full Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Abebe Girma" style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.boxShadow = "0 0 0 3px #bfdbfe55" }}
            onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none" }}
          />
        </div>
        <div>
          <label style={labelStyle}>User ID</label>
          <input type="text" value={user.id} disabled style={inputDisabledStyle} title="User ID cannot be changed" />
        </div>
        <div>
          <label style={labelStyle}>Phone Number</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="+251 9XX XXX XXX" style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.boxShadow = "0 0 0 3px #bfdbfe55" }}
            onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "none" }}
          />
        </div>
        <div>
          <label style={labelStyle}>Email Address</label>
          <input type="email" value={user.email} disabled style={inputDisabledStyle} title="Email cannot be changed here" />
        </div>
        <div>
          <label style={labelStyle}>Organization Unit</label>
          <input type="text" value={user.orgUnit?.name ?? "—"} disabled style={inputDisabledStyle} />
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <input type="text" value={user.role} disabled style={inputDisabledStyle} />
        </div>
      </div>

      {/* ── SAVE ── */}
      <div style={{ marginTop: 22, borderTop: "1px solid #f1f5f9", paddingTop: 18 }}>
        <button
          onClick={handleSave} disabled={loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 20px", borderRadius: 7, fontSize: 13, fontWeight: 600,
            background: loading ? "#93c5fd" : "#2563eb", color: "#fff", border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.15s",
            boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = "#1d4ed8" }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = "#2563eb" }}
        >
          {loading
            ? <><Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Saving…</>
            : <><Save size={14} /> Save Changes</>}
        </button>
      </div>
      
      <style>{`
  @keyframes fadeIn    { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
  @keyframes spin      { to { transform:rotate(360deg) } }
  @keyframes lightboxPop {
    from { opacity:0; transform:scale(0.88) }
    to   { opacity:1; transform:scale(1) }
  }
`}</style>


    </div>
  )
}
