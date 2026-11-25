// lib/depreciation.ts
// Asset depreciation calculations (straight-line method).
// Uses purchaseCost and a configurable useful life (from system settings).

export interface DepreciationInfo {
  purchaseCost: number | null
  annualDepreciation: number | null
  accumulatedDepreciation: number | null
  bookValue: number | null
  yearsElapsed: number
  yearsRemaining: number
  fullyDepreciated: boolean
}

export function computeDepreciation(
  purchaseCost: Date | string | number | null,
  purchaseDate: Date | string | null,
  usefulLifeYears: number = 5,
  salvageValuePercent: number = 0
): DepreciationInfo {
  const cost = typeof purchaseCost === "string" ? parseFloat(purchaseCost) : purchaseCost as number

  if (!cost || cost <= 0 || !purchaseDate) {
    return {
      purchaseCost: cost || null,
      annualDepreciation: null,
      accumulatedDepreciation: null,
      bookValue: cost || null,
      yearsElapsed: 0,
      yearsRemaining: usefulLifeYears,
      fullyDepreciated: false,
    }
  }

  const purchase = new Date(purchaseDate)
  const now = new Date()
  const salvageValue = cost * (salvageValuePercent / 100)
  const depreciableAmount = cost - salvageValue
  const annualDepreciation = depreciableAmount / usefulLifeYears

  const yearsElapsed = Math.min(
    (now.getTime() - purchase.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    usefulLifeYears
  )

  const accumulatedDepreciation = annualDepreciation * yearsElapsed
  const bookValue = cost - accumulatedDepreciation
  const fullyDepreciated = yearsElapsed >= usefulLifeYears

  return {
    purchaseCost: cost,
    annualDepreciation: Math.round(annualDepreciation * 100) / 100,
    accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
    bookValue: Math.round(bookValue * 100) / 100,
    yearsElapsed: Math.round(yearsElapsed * 10) / 10,
    yearsRemaining: Math.max(0, Math.round((usefulLifeYears - yearsElapsed) * 10) / 10),
    fullyDepreciated,
  }
}

export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "ETB", minimumFractionDigits: 2 }).format(value)
}
