import crypto from "crypto"
import { cache } from "react"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"
import { httpError } from "@/lib/http"

const SESSION_COOKIE = "stockflow_session"
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days, in seconds
const ROLE_RANK = { VIEWER: 0, STANDARD: 1, ADMIN: 2, SUPER_ADMIN: 3 }
const ROLE_REFUSAL = {
  STANDARD: "Viewers can only view. Ask an admin if you need to record stock.",
  ADMIN: "Only an admin can do this",
  SUPER_ADMIN: "Only a Super admin can do this",
}

export const MAX_FAILED_LOGINS = 5
export const LOCK_MINUTES = 15

function getSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET env var is not set")
  return secret
}

// ── Password hashing (scrypt, salted) ───────────────────────────────────────
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":")
    const expected = Buffer.from(hash, "hex")
    const check = crypto.scryptSync(password, salt, 64)
    return expected.length === check.length && crypto.timingSafeEqual(expected, check)
  } catch {
    return false
  }
}

// ── Signed session cookie ───────────────────────────────────────────────────
// Value: userId.sessionVersion.issuedAt — a session ends when it is 7 days old or when the
// user's sessionVersion changes (password change or reset, deactivation).
function sign(value) {
  const sig = crypto.createHmac("sha256", getSecret()).update(value).digest("hex")
  return `${value}.${sig}`
}

function unsign(signed) {
  const i = signed.lastIndexOf(".")
  if (i === -1) return null
  const value = signed.slice(0, i)
  const sigBuf = Buffer.from(signed.slice(i + 1))
  const expBuf = Buffer.from(crypto.createHmac("sha256", getSecret()).update(value).digest("hex"))
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null
  return value
}

export async function createSession(user) {
  const cookieStore = await cookies()
  const issuedAt = Math.floor(Date.now() / 1000)
  cookieStore.set(SESSION_COOKIE, sign(`${user.id}.${user.sessionVersion ?? 0}.${issuedAt}`), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  })
}

export async function destroySession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

async function readSession() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  const value = raw && unsign(raw)
  if (!value) return null
  const [userId, version, issuedAt] = value.split(".")
  if (!userId || version === undefined || issuedAt === undefined) return null
  const age = Date.now() / 1000 - Number(issuedAt)
  // A little negative age is allowed for clock differences between servers
  if (!Number.isFinite(age) || age < -300 || age > SESSION_MAX_AGE) return null
  return { userId, version: Number(version) }
}

// The signed-in user, or null. Cached per request, so a layout and its page share one lookup.
export const getCurrentUser = cache(async () => {
  const session = await readSession()
  if (!session) return null
  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user || !user.isActive || user.sessionVersion !== session.version) return null
  return user
})

// Route guards: throw an error with a status that lib/http handleError turns into a response
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw httpError("You must be signed in to do this", 401)
  return user
}

export async function requireRole(minRole) {
  const user = await requireUser()
  if ((ROLE_RANK[user.role] ?? 0) < ROLE_RANK[minRole]) throw httpError(ROLE_REFUSAL[minRole], 403)
  return user
}

// Anyone who may record stock or change products: every role except Viewer
export async function requireEditor() {
  return requireRole("STANDARD")
}

export async function requireAdmin() {
  return requireRole("ADMIN")
}

export async function requireSuperAdmin() {
  return requireRole("SUPER_ADMIN")
}

// Users given the Approver permission (any role, Viewers included)
export async function requireApprover() {
  const user = await requireUser()
  if (!user.canApprove) throw httpError("Only an approver can approve stock outs. An admin can give you the Approver permission.", 403)
  return user
}
