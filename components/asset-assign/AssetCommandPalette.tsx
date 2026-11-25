//components/asset-assign/AssetCommandPalette.tsx
//tracking/components/asset-assign/AssetCommandPalette.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { useToast } from "@/components/ToastProvider"

type Asset = {
  id: string
  itemCode?: string
  description?: string
  serialNumber?: string
  tagNumber?: string
}

export default function AssetCommandPalette() {
  const { showToast } = useToast()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)

  /* ---------------- DRAG STATE ---------------- */
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })
  const [pos, setPos] = useState({ x: 200, y: 100 })

  /* ---------------- HOTKEY ---------------- */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === "Escape") setOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  /* ---------------- SEARCH ---------------- */
  useEffect(() => {
    if (!open) return
    if (!query) return setAssets([])

    const delay = setTimeout(async () => {
      setLoading(true)

      try {
        const res = await fetch(`/api/assets/search?q=${query}`)
        const data = await res.json()
        setAssets(data)
      } catch {
        showToast("Search failed", "error")
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(delay)
  }, [query, open])

  /* ---------------- DRAG ---------------- */
  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true

    offset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    }
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!dragging.current) return

      setPos({
        x: e.clientX - offset.current.x,
        y: e.clientY - offset.current.y
      })
    }

    function up() {
      dragging.current = false
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)

    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/30 z-[9999]">
      <div
        className="w-[600px] bg-white rounded-xl shadow-xl fixed flex flex-col"
        style={{
          top: pos.y,
          left: pos.x,
          height: "520px"
        }}
      >
        {/* HEADER (DRAG HANDLE) */}
        <div
          onPointerDown={startDrag}
          className="cursor-grab px-4 py-2 border-b font-semibold bg-gray-100 rounded-t-xl"
        >
          🔍 Asset Command Palette (Ctrl + K)
        </div>

        {/* SEARCH */}
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets by ID, tag, serial..."
          className="p-3 border-b outline-none"
        />

        {/* RESULTS */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <p className="p-3 text-sm text-gray-500">Searching...</p>
          )}

          {!loading && assets.length === 0 && query && (
            <p className="p-3 text-sm text-gray-500">
              No assets found
            </p>
          )}

          {assets.map(a => (
            <div
              key={a.id}
              className="p-3 hover:bg-gray-100 cursor-pointer border-b"
              onClick={() => {
                router.push(`/dashboard/assets/${a.id}`)
                setOpen(false)
                setQuery("")
              }}
            >
              <p className="font-medium">
                {a.itemCode || a.tagNumber || a.id}
              </p>
              <p className="text-xs text-gray-500">
                {a.description} • {a.serialNumber}
              </p>
            </div>
          ))}
        </div>

        {/* FOOTER */}
        <div className="p-2 text-xs text-gray-400 border-t flex justify-between">
          <span>ESC to close</span>
          <span>Drag header to move</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
