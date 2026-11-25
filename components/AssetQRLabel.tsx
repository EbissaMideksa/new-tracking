// components/AssetQRLabel.tsx
// Generates a printable QR code label for an asset.
// The QR encodes the asset's detail page URL — scanning it opens the asset.

"use client"

import { QRCodeSVG } from "qrcode.react"

interface Props {
  tagNumber: string
  serialNumber: string
  itemCode: string
  description: string
  baseUrl: string
  assetId: string
}

export default function AssetQRLabel({ tagNumber, serialNumber, itemCode, description, baseUrl, assetId }: Props) {
  const url = `${baseUrl}/dashboard/assets/${assetId}`

  return (
    <div
      id="qr-label"
      style={{
        width: 300,
        padding: 16,
        border: "2px solid #000",
        borderRadius: 8,
        fontFamily: "system-ui, sans-serif",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center", width: "100%" }}>
        <QRCodeSVG value={url} size={100} level="M" />
        <div style={{ flex: 1, fontSize: 11 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{tagNumber || "No Tag"}</div>
          <div style={{ color: "#666" }}>S/N: {serialNumber}</div>
          <div style={{ color: "#666" }}>Code: {itemCode}</div>
        </div>
      </div>
      {description && (
        <div style={{ fontSize: 10, color: "#444", textAlign: "center", marginTop: 4, wordBreak: "break-word" }}>
          {description}
        </div>
      )}
      <div style={{ fontSize: 8, color: "#999", marginTop: 4 }}>
        Ethio Telecom Asset Tracking
      </div>
    </div>
  )
}
