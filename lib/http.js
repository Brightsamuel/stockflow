import { NextResponse } from "next/server"
import { TIME_ZONE_OFFSET } from "@/lib/format"

export function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

export function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

// An error whose message is safe to show the user, with the HTTP status to send
export function httpError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

// Turns anything a route throws into a JSON response. Errors carrying a status (auth checks,
// validation) keep their message; Prisma codes can be mapped to friendly messages; the rest
// are logged and reported as `fallback`.
export function handleError(e, fallback = "Something went wrong", prismaMessages = {}) {
  if (e?.status) return fail(e.message, e.status)
  if (e?.code && prismaMessages[e.code]) return fail(prismaMessages[e.code], e.code === "P2025" ? 404 : 409)
  console.error(e)
  return fail(fallback, 500)
}

// Accepts YYYY-MM-DD (or any date string); today in any time zone is allowed, later dates aren't
export function parseEntryDate(raw) {
  let date = raw ? new Date(raw) : new Date()
  if (isNaN(date)) date = new Date()
  // Up to 14 hours ahead of UTC covers "today" everywhere
  if (date.getTime() > Date.now() + 14 * 60 * 60 * 1000) throw httpError("The date cannot be in the future")
  return date
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

// A From / To pair of YYYY-MM-DD days, covering whole days in the business's time zone.
// Either may be left out unless `required`; returns { from, to } as Dates (or null).
export function parseDateRange(fromRaw, toRaw, { required = false } = {}) {
  if (required && (!fromRaw || !toRaw)) throw httpError("Choose both dates")
  const day = (raw, time) => {
    if (!raw) return null
    const date = DAY.test(raw) ? new Date(`${raw}T${time}${TIME_ZONE_OFFSET}`) : new Date(NaN)
    if (isNaN(date)) throw httpError("Invalid date")
    return date
  }
  const from = day(fromRaw, "00:00:00.000")
  const to = day(toRaw, "23:59:59.999")
  if (from && to && from > to) throw httpError("The From date must be on or before the To date")
  return { from, to }
}
