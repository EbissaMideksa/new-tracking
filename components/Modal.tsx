// components/Modal.tsx
// Shared centered modal shell: portal + backdrop + Escape + click-outside +
// role/aria-modal. Use this for every dialog/drawer form so behaviour is
// consistent across the app.

"use client"

import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"

export type ModalSize = "sm" | "md" | "lg" | "xl"

const MAX_W: Record<ModalSize, number> = {
  sm: 420,
  md: 560,
  lg: 760,
  xl: 1040,
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  align = "center",
  closeOnBackdrop = true,
  closeOnEsc = true,
  style,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  align?: "center" | "start"
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
  style?: React.CSSProperties
}) {
  useEffect(() => {
    if (!open || !closeOnEsc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, closeOnEsc, onClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: align === "center" ? "center" : "flex-start",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "100%",
          maxWidth: MAX_W[size],
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          margin: "auto 0",
          ...style,
        }}
      >
        {(title || subtitle) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
              padding: "18px 22px 10px",
            }}
          >
            <div>
              {title && (
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                  {title}
                </h2>
              )}
              {subtitle && (
                <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: "#64748b" }}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                color: "#94a3b8",
                padding: 2,
              }}
            >
              ×
            </button>
          </div>
        )}

        <div style={{ padding: "6px 22px 18px" }}>{children}</div>

        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "14px 22px 18px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default Modal