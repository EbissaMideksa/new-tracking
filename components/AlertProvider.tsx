// components/AlertProvider.tsx
// Promise-based informational modal. Replaces native window.alert so messages
// render as an in-app modal dialog.
//
// Usage:
//   const alert = useAlert()
//   await alert("Upload failed")

"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import Modal from "./Modal"

export type AlertOptions = {
  title?: string
  confirmLabel?: string
}

type AlertState = AlertOptions & {
  message: string
  resolve: () => void
}

type AlertContextType = {
  alert: (message: string, options?: AlertOptions) => Promise<void>
}

const AlertContext = createContext<AlertContextType | null>(null)

export function useAlert() {
  const ctx = useContext(AlertContext)
  if (!ctx) throw new Error("useAlert must be used inside AlertProvider")
  return ctx.alert
}

export default function AlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AlertState | null>(null)
  const active = useRef<AlertState | null>(null)

  const alert = useCallback((message: string, options?: AlertOptions) => {
    return new Promise<void>((resolve) => {
      const next: AlertState = { ...options, message, resolve }
      active.current = next
      setState(next)
    })
  }, [])

  const settle = useCallback(() => {
    const current = active.current
    if (!current) return
    active.current = null
    setState(null)
    current.resolve()
  }, [])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault()
        settle()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [state, settle])

  return (
    <AlertContext.Provider value={{ alert }}>
      {children}
      <Modal
        open={!!state}
        onClose={settle}
        title={state?.title ?? "Notice"}
        size="sm"
        footer={
          <button
            type="button"
            onClick={settle}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {state?.confirmLabel ?? "OK"}
          </button>
        }
      >
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#475569", whiteSpace: "pre-line" }}>
          {state?.message}
        </p>
      </Modal>
    </AlertContext.Provider>
  )
}