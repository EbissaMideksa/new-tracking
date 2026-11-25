"use client"
// components/AssetScanner.tsx
// Camera-based barcode scanner (phone back camera or webcam) using @zxing/browser.
// Dynamically imported so the library (which uses navigator.mediaDevices) never
// loads on the server. Calls onDetected(serial) for each newly-detected barcode
// (debounced so the same code held in view doesn't fire repeatedly).

import { useEffect, useRef, useState } from "react"

interface Props {
  onDetected: (serial: string) => void
}

export default function AssetScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const lastRef = useRef<{ text: string; t: number } | null>(null)
  const [running,   setRunning]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [devices,   setDevices]   = useState<MediaDeviceInfo[]>([])
  const [deviceId,  setDeviceId]  = useState<string | undefined>(undefined)
  const [lastScan,  setLastScan]  = useState<string | null>(null)

  async function start(selectedId?: string) {
    setError(null)
    if (!videoRef.current) return
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser")
      const reader = new BrowserMultiFormatReader()
      const list = await BrowserMultiFormatReader.listVideoInputDevices()
      setDevices(list)

      const cb = (result: any) => {
        if (!result) return
        const text = String(result.getText?.() ?? "").trim()
        if (!text) return
        const now = Date.now()
        const last = lastRef.current
        if (last && last.text === text && now - last.t < 1500) return // debounce repeats
        lastRef.current = { text, t: now }
        setLastScan(text)
        onDetected(text)
      }

      let controls
      if (selectedId) {
        controls = await reader.decodeFromVideoDevice(selectedId, videoRef.current, cb)
      } else {
        // Prefer the back camera on mobile; fall back to the default camera.
        try {
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: "environment" } },
            videoRef.current,
            cb
          )
        } catch {
          controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, cb)
        }
      }
      controlsRef.current = controls
      setRunning(true)
    } catch (e: any) {
      setError(e?.message || "Camera access failed. Allow camera permission and open the page over HTTPS.")
      setRunning(false)
    }
  }

  function stop() {
    try { controlsRef.current?.stop() } catch {}
    controlsRef.current = null
    setRunning(false)
  }

  // Stop the camera when the component unmounts (e.g. switching back to Excel mode)
  useEffect(() => () => stop(), [])

  async function switchCamera(id: string) {
    setDeviceId(id || undefined)
    if (running) { stop(); await start(id || undefined) }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <video
        ref={videoRef}
        className="w-full max-w-md rounded-lg border-2 border-green-300 bg-black"
        muted
        playsInline
        autoPlay
      />
      <div className="flex gap-2 items-center flex-wrap justify-center">
        {!running ? (
          <button onClick={() => start(deviceId)} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-semibold">
            ▶ Start camera
          </button>
        ) : (
          <button onClick={stop} className="px-4 py-2 bg-red-600 text-white rounded text-sm font-semibold">
            ■ Stop camera
          </button>
        )}
        {devices.length > 1 && (
          <select
            value={deviceId || ""}
            onChange={e => switchCamera(e.target.value)}
            className="px-2 py-1 border rounded text-xs"
          >
            <option value="">Auto (back camera)</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
            ))}
          </select>
        )}
      </div>
      {lastScan && (
        <div className="text-xs text-green-700 font-medium">
          Last scanned: <span className="font-mono">{lastScan}</span>
        </div>
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="text-xs text-gray-500 text-center max-w-md">
        Point the camera at the asset barcode. Each detected serial is added to the list below — then fill the fields manually.
      </div>
    </div>
  )
}
