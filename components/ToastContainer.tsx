
"use client"

import { useEffect, useState } from "react"

type ToastType = "success" | "error" | "info"

type Toast = {
  id: number
  type: ToastType
  message: string
}

export default function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 w-[340px]">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => Math.max(p - 1.5, 0))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const config: Record<
    ToastType,
    {
      icon: string
      bg: string
      iconBg: string
      text: string
      ring: string
    }
  > = {
    success: {
      icon: "✔",
      bg: "from-green-500/30 to-green-600/20 border-green-500/40",
      iconBg: "bg-green-500",
      text: "text-white",
      ring: "shadow-green-500/25",
    },
    error: {
      icon: "✖",
      bg: "from-red-500/30 to-red-600/20 border-red-500/40",
      iconBg: "bg-red-500",
      text: "text-white",
      ring: "shadow-red-500/30",
    },
    info: {
      icon: "ℹ",
      bg: "from-blue-500/15 to-blue-600/5 border-blue-500/30",
      iconBg: "bg-blue-500",
      text: "text-blue-100",
      ring: "shadow-blue-500/20",
    },
  }

  const style = config[toast.type]

  return (
    <div
      className={`
        relative overflow-hidden
        backdrop-blur-xl
        bg-gradient-to-r ${style.bg}
        border rounded-xl
        shadow-lg ${style.ring}
        px-4 py-3
        animate-toast-in
      `}
    >
      <div className="flex items-start gap-3">
        {/* ICON */}
        <div
          className={`w-8 h-8 flex items-center justify-center rounded-full text-white text-sm font-bold ${style.iconBg}`}
        >
          {style.icon}
        </div>

        {/* MESSAGE (now visually matches icon strength) */}
        <div className="flex-1">
          <p className={`text-sm font-semibold leading-snug ${style.text}`}>
            {toast.message}
          </p>
        </div>
      </div>

      {/* progress */}
      <div className="absolute bottom-0 left-0 h-[3px] bg-white/10 w-full">
        <div
          className="h-full bg-white/60 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* animation */}
      <style jsx>{`
        .animate-toast-in {
          animation: toastIn 0.25s ease-out;
        }

        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateX(40px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
