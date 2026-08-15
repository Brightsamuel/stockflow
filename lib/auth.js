import crypto from "crypto"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"

const SESSION_COOKIE = "stockflow_session"
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days
const ROLE_RANK = { STANDARD: 0, ADMIN: 1, SUPER_ADMIN: 2 }

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
  const [salt, hash] = stored.split(":")
  const check = crypto.scryptSync(password, salt, 64).toString("hex")
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"))
}

// ── Signed session cookie ───────────────────────────────────────────────────
function sign(value) {
  const sig = crypto.createHmac("sha256", getSecret()).update(value).digest("hex")
  return `${value}.${sig}`
}

function unsign(signed) {
  const i = signed.lastIndexOf(".")
  if (i === -1) return null
  const value = signed.slice(0, i)
  const sig = signed.slice(i + 1)
  const expected = crypto.createHmac("sha256", getSecret()).update(value).digest("hex")
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return null
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null
  return value
}

export async function createSession(userId) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, sign(userId), {
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

// Returns the current logged-in User (or null). Safe to call from route handlers.
export async function getCurrentUser() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(SESSION_COOKIE)?.value
  if (!raw) return null
  const userId = unsign(raw)
  if (!userId) return null
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) return null
  return user
}

// Throws a Response-friendly error object route handlers can return directly
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) {
    const err = new Error("Not authenticated")
    err.status = 401
    throw err
  }
  return user
}

export async function requireRole(minRole) {
  const user = await requireUser()
  if ((ROLE_RANK[user.role] ?? 0) < ROLE_RANK[minRole]) {
    const err = new Error(`${minRole.replace('_', ' ')} access required`)
    err.status = 403
    throw err
  }
  return user
}

export async function requireAdmin() {
  return requireRole("ADMIN")
}

export async function requireSuperAdmin() {
  return requireRole("SUPER_ADMIN")
}