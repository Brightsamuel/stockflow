import prisma from "@/lib/prisma"
import { verifyPassword, hashPassword, createSession, MAX_FAILED_LOGINS, LOCK_MINUTES } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { MIN_PASSWORD_LENGTH } from "@/lib/constants"

const INVALID = "Invalid username or password"

function lockedMessage(until) {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60000))
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask an admin to unlock your account.`
}

export async function POST(req) {
  try {
    const { username, password } = await req.json()
    if (!username?.trim() || !password) return fail("Enter your username and password")

    // The very first sign-in creates the Super admin account
    if ((await prisma.user.count()) === 0) {
      if (password.length < MIN_PASSWORD_LENGTH)
        return fail(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters`)
      const admin = await prisma.user.create({
        data: { username: username.trim(), passwordHash: hashPassword(password), role: "SUPER_ADMIN" },
      })
      await createSession(admin)
      return json({ id: admin.id, username: admin.username, role: admin.role, bootstrapped: true })
    }

    const user = await prisma.user.findUnique({ where: { username: username.trim() } })
    if (!user) return fail(INVALID, 401)

    if (user.lockedUntil && user.lockedUntil > new Date()) return fail(lockedMessage(user.lockedUntil), 423)

    if (!verifyPassword(password, user.passwordHash)) {
      const failed = user.failedLogins + 1
      if (failed >= MAX_FAILED_LOGINS) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000)
        await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil } })
        return fail(lockedMessage(lockedUntil), 423)
      }
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed } })
      return fail(INVALID, 401)
    }

    // Only revealed once the password is right
    if (!user.isActive)
      return fail("This account has been deactivated. Ask an administrator to reactivate it.", 403)

    if (user.failedLogins || user.lockedUntil)
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } })

    await createSession(user)
    return json({ id: user.id, username: user.username, role: user.role })
  } catch (e) {
    return handleError(e, "Sign-in failed. Please try again.")
  }
}
