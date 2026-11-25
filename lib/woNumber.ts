/**
 * Generates a timestamp-based Work Order number.
 * index > 0 appends a zero-padded suffix to prevent collisions
 * when multiple WOs are created in the same millisecond (bulk upload).
 */
export function generateWorkOrderNo(index = 0): string {
  const now = new Date()
  const pad = (n: number, len: number) => String(n).padStart(len, "0")
  const ts  = [
    now.getFullYear(),
    pad(now.getMonth() + 1, 2),
    pad(now.getDate(),      2),
    pad(now.getHours(),     2),
    pad(now.getMinutes(),   2),
    pad(now.getSeconds(),   2),
    pad(now.getMilliseconds(), 3),
  ].join("")
  return index > 0 ? `WO_${ts}_${pad(index, 3)}` : `WO_${ts}`
}

