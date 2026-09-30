// Formatting shared by server and client components. A fixed locale and time zone keep
// server-rendered and browser-rendered text identical (no hydration mismatches).
export const TIME_ZONE = "Africa/Kampala"
// Kampala keeps UTC+3 all year (no daylight saving); used to turn a YYYY-MM-DD day into its hours
export const TIME_ZONE_OFFSET = "+03:00"
export const CURRENCY = "UGX"

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TIME_ZONE })
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE,
})

export function fmtNum(n) {
  const value = Number(n)
  return Number.isFinite(value) ? numberFormat.format(value) : "—"
}

export function fmtMoney(n) {
  return `${CURRENCY} ${fmtNum(n)}`
}

// Signed quantity, e.g. "+20" / "−5"
export function fmtSigned(n) {
  const value = Number(n) || 0
  if (value === 0) return "0"
  return `${value > 0 ? "+" : "−"}${fmtNum(Math.abs(value))}`
}

export function fmtDate(date) {
  if (!date) return "—"
  const d = new Date(date)
  return isNaN(d) ? "—" : dateFormat.format(d)
}

export function fmtDateTime(date) {
  if (!date) return "—"
  const d = new Date(date)
  return isNaN(d) ? "—" : dateTimeFormat.format(d)
}

export function timeAgo(date) {
  const d = new Date(date)
  const diff = (Date.now() - d) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return "yesterday"
  return fmtDate(d)
}

// Today's date as YYYY-MM-DD in the business's time zone (for date inputs). Computed the same way
// on the server and in the browser, so forms render identically on both.
const isoDateFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE })

export function todayInput() {
  return isoDateFormat.format(new Date())
}

// Quick date ranges for report filters, as YYYY-MM-DD pairs
export function datePresets() {
  const today = todayInput()
  const [y, m, d] = today.split("-").map(Number)
  const iso = (year, month, day) => new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
  return [
    { label: "This month", from: iso(y, m, 1), to: today },
    { label: "Last month", from: iso(y, m - 1, 1), to: iso(y, m, 0) },
    { label: "Last 30 days", from: iso(y, m, d - 29), to: today },
    { label: "This year", from: iso(y, 1, 1), to: today },
  ]
}

export function plural(count, word, many = `${word}s`) {
  return `${fmtNum(count)} ${count === 1 ? word : many}`
}

export function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase()
}
