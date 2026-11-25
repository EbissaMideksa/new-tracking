
"use client"

import {
  createContext,
  useContext,
  useState
} from "react"

type Crumb = {
  id: string
  name: string
  type: string
}

type BreadcrumbContextType = {
  breadcrumbs: Crumb[]
  setBreadcrumbs: (crumbs: Crumb[]) => void
  pushCrumb: (crumb: Crumb) => void
  clearAfter: (id: string) => void
}

const BreadcrumbContext =
  createContext<BreadcrumbContextType | null>(null)

export function BreadcrumbProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [breadcrumbs, setBreadcrumbs] =
    useState<Crumb[]>([])

  const pushCrumb = (crumb: Crumb) => {
    setBreadcrumbs((prev) => {
      const exists = prev.findIndex(
        (c) => c.id === crumb.id
      )

      if (exists !== -1) {
        return prev.slice(0, exists + 1)
      }

      return [...prev, crumb]
    })
  }

  const clearAfter = (id: string) => {
    setBreadcrumbs((prev) => {
      const idx = prev.findIndex(
        (c) => c.id === id
      )

      return idx !== -1
        ? prev.slice(0, idx + 1)
        : prev
    })
  }

  return (
    <BreadcrumbContext.Provider
      value={{
        breadcrumbs,
        setBreadcrumbs,
        pushCrumb,
        clearAfter
      }}
    >
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbContext)

  if (!context) {
    throw new Error(
      "useBreadcrumbs must be used within BreadcrumbProvider"
    )
  }

  return context
}
