import { NextResponse } from "next/server"

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
