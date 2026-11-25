// components/CameraModal.tsx
// Shared webcam capture modal — extracted verbatim from PersonalInfoForm so
// the asset detail page (and any future consumer) reuses the exact same camera UX.
"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Camera, CheckCircle, AlertCircle, Loader2, X, ZoomIn, RotateCcw, SwitchCamera } from "lucide-react"

function dataURLtoFile(dataURL: string, filename: string): File {
  const [header, b64] = dataURL.split(",")
  const mime  = header.match(/:(.*?);/)![1]
  const bytes = atob(b64)
  const arr   = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new File([arr], filename, { type: mime })
}

// ─── Camera Modal ─────────────────────────────────────────────────────────────
interface CameraModalProps {
  onCapture:       (file: File, previewUrl: string) => void
  onClose:         () => void
  /** Lifted ref: parent holds the active MediaStream so it can kill it directly. */
  activeStreamRef: React.MutableRefObject<MediaStream | null>
}

export function CameraModal({ onCapture, onClose, activeStreamRef }: CameraModalProps) {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  // Alias: write both the local convenience ref AND the lifted parent ref
  const streamRef  = activeStreamRef

  const [error,        setError]        = useState<string | null>(null)
  const [facingMode,   setFacingMode]   = useState<"user" | "environment">("user")
  const [captured,     setCaptured]     = useState<string | null>(null)
  const [starting,     setStarting]     = useState(true)
  const [hasMultipleCams, setHasMultipleCams] = useState(false)
  const [zoom,         setZoom]         = useState(1)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    stopStream()
    setError(null)
    setStarting(true)
    try {
      // Check for multiple cameras
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoCams = devices.filter(d => d.kind === "videoinput")
      setHasMultipleCams(videoCams.length > 1)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (e: any) {
      const msg =
        e.name === "NotAllowedError"  ? "Camera access denied. Please allow camera permissions." :
        e.name === "NotFoundError"    ? "No camera device found on this device." :
        e.name === "NotReadableError" ? "Camera is already in use by another application." :
        "Unable to access camera. Please try uploading a file instead."
      setError(msg)
    } finally {
      setStarting(false)
    }
  }, [stopStream])

  useEffect(() => {
    startCamera(facingMode)
    return () => stopStream()
  }, []) // eslint-disable-line

  const flipCamera = () => {
    const next = facingMode === "user" ? "environment" : "user"
    setFacingMode(next)
    setCaptured(null)
    startCamera(next)
  }

  const takeSnapshot = () => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")!
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
    setCaptured(dataUrl)
  }

  const retake = () => {
    setCaptured(null)
    setZoom(1)
  }

  const confirm = () => {
    if (!captured) return
    const file = dataURLtoFile(captured, `camera-${Date.now()}.jpg`)
    onCapture(file, captured)
  }

  const isMirrored = facingMode === "user" && !captured

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, animation: "fadeIn 0.15s ease",
    }}>
      <div style={{
        background: "#0f172a", borderRadius: 18,
        width: "100%", maxWidth: 520,
        overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        border: "1px solid #1e293b",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #1e293b",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Camera size={16} color="#60a5fa" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>
              {captured ? "Preview — happy with this?" : "Take a Photo"}
            </span>
          </div>
          <button
            onClick={() => { stopStream(); onClose() }}
            style={{ background: "none", border: "none", cursor: "pointer",
              color: "#64748b", padding: 4, borderRadius: 6,
              display: "flex", transition: "color 0.15s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#f1f5f9"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#64748b"}
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewfinder */}
        <div style={{
          position: "relative", background: "#000",
          aspectRatio: "4/3", overflow: "hidden",
        }}>
          {/* Live video */}
          <video
            ref={videoRef}
            playsInline muted
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              display: captured ? "none" : "block",
              transform: isMirrored ? "scaleX(-1)" : "none",
            }}
          />

          {/* Snapshot preview */}
          {captured && (
            <img
              src={captured}
              alt="captured"
              style={{
                width: "100%", height: "100%", objectFit: "cover",
                transformOrigin: "center",
                transform: `scale(${zoom})`,
                transition: "transform 0.2s ease",
              }}
            />
          )}

          {/* Loading overlay */}
          {starting && !error && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 10,
              background: "#000",
            }}>
              <Loader2 size={28} color="#60a5fa" style={{ animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 13, color: "#64748b" }}>Starting camera…</span>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              background: "#0f172a", padding: 24, textAlign: "center",
            }}>
              <AlertCircle size={32} color="#f87171" />
              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, maxWidth: 300 }}>{error}</p>
              <button
                onClick={() => startCamera(facingMode)}
                style={{
                  padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "#1e293b", color: "#94a3b8", border: "1px solid #334155",
                  cursor: "pointer",
                }}
              >Retry</button>
            </div>
          )}

          {/* Viewfinder overlay guides */}
          {!starting && !error && !captured && (
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
            }}>
              {/* Corner brackets */}
              {[
                { top: 24, left: 24,  borderTop: "2px solid rgba(255,255,255,0.5)", borderLeft:  "2px solid rgba(255,255,255,0.5)" },
                { top: 24, right: 24, borderTop: "2px solid rgba(255,255,255,0.5)", borderRight: "2px solid rgba(255,255,255,0.5)" },
                { bottom: 24, left: 24,  borderBottom: "2px solid rgba(255,255,255,0.5)", borderLeft:  "2px solid rgba(255,255,255,0.5)" },
                { bottom: 24, right: 24, borderBottom: "2px solid rgba(255,255,255,0.5)", borderRight: "2px solid rgba(255,255,255,0.5)" },
              ].map((s, i) => (
                <div key={i} style={{ position: "absolute", width: 20, height: 20, ...s }} />
              ))}
            </div>
          )}

          {/* Flip camera button */}
          {!captured && !error && hasMultipleCams && (
            <button
              onClick={flipCamera}
              style={{
                position: "absolute", top: 12, right: 12,
                background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "50%", width: 38, height: 38,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#fff", backdropFilter: "blur(4px)",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.7)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.5)"}
              title="Switch camera"
            >
              <SwitchCamera size={16} />
            </button>
          )}

          {/* Zoom slider for captured image */}
          {captured && (
            <div style={{
              position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(0,0,0,0.55)", padding: "6px 14px", borderRadius: 20,
              backdropFilter: "blur(4px)",
            }}>
              <ZoomIn size={13} color="#94a3b8" />
              <input
                type="range" min="1" max="2.5" step="0.05"
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                style={{ width: 80, accentColor: "#60a5fa" }}
              />
              <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 32 }}>{zoom.toFixed(1)}×</span>
            </div>
          )}
        </div>

        {/* Hidden canvas for snapshot */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Controls */}
        <div style={{
          padding: "16px 20px",
          display: "flex", alignItems: "center",
          justifyContent: captured ? "space-between" : "center",
          gap: 12, background: "#0f172a",
          borderTop: "1px solid #1e293b",
        }}>
          {!captured ? (
            /* ── Shutter ── */
            <button
              onClick={takeSnapshot}
              disabled={!!error || starting}
              title="Take photo"
              style={{
                width: 58, height: 58, borderRadius: "50%",
                border: "3px solid #fff",
                background: "transparent",
                cursor: error || starting ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative", transition: "transform 0.1s",
                opacity: error || starting ? 0.35 : 1,
              }}
              onMouseDown={e => (e.currentTarget as HTMLElement).style.transform = "scale(0.93)"}
              onMouseUp={e =>   (e.currentTarget as HTMLElement).style.transform = "scale(1)"}
            >
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "#fff",
              }} />
            </button>
          ) : (
            /* ── Retake / Use Photo ── */
            <>
              <button
                onClick={retake}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: "#1e293b", border: "1px solid #334155",
                  color: "#94a3b8", cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#273449"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#1e293b"}
              >
                <RotateCcw size={14} /> Retake
              </button>
              <button
                onClick={confirm}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: "#2563eb", border: "none",
                  color: "#fff", cursor: "pointer",
                  boxShadow: "0 2px 10px rgba(37,99,235,0.45)",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#1d4ed8"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#2563eb"}
              >
                <CheckCircle size={14} /> Use This Photo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
