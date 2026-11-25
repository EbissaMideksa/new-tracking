// components/ConfirmProvider.tsx
// Promise-based confirmation modal. Replaces native window.confirm so every
// destructive action (delete, retire, reset, bulk update) renders in-app.
//
// Usage:
//   const confirm = useConfirm()
//   if (!(await confirm({ message: "Delete this user?" }))) return

"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

export type ConfirmTone = "danger" | "default"

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void
}

type ConfirmContextType = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider")
  return ctx.confirm
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const active = useRef<ConfirmState | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const next: ConfirmState = { ...options, resolve }
      active.current = next
      setState(next)
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    const current = active.current
    if (!current) return
    active.current = null
    setState(null)
    current.resolve(value)
  }, [])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        settle(false)
      } else if (e.key === "Enter") {
        e.preventDefault()
        settle(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [state, settle])

  const danger = !state || state.tone !== "default"

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) settle(false)
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={state.title ?? "Confirm"}
            style={{
              background: "#fff",
              borderRadius: 12,
              width: "100%",
              maxWidth: 440,
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "20px 22px 6px" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                {state.title ?? (danger ? "Please confirm" : "Confirm")}
              </h2>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "#475569",
                  whiteSpace: "pre-line",
                }}
              >
                {state.message}
              </p>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "18px 22px 20px",
              }}
            >
              <button
                type="button"
                onClick={() => settle(false)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                {state.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: danger ? "1px solid #dc2626" : "1px solid #2563eb",
                  background: danger ? "#dc2626" : "#2563eb",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                {state.confirmLabel ?? (danger ? "Delete" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}