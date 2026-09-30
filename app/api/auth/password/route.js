import prisma from "@/lib/prisma"
import { requireUser, verifyPassword, hashPassword, createSession } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { MIN_PASSWORD_LENGTH } from "@/lib/constants"

// Change the signed-in user's own password. Other sessions end; this one is renewed.
export async function POST(req) {
  try {
    const user = await requireUser()
    const { currentPassword, newPassword } = await req.json()
    if (!currentPassword || !newPassword) return fail("Enter your current and new password")
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return fail(`The new password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    if (!verifyPassword(currentPassword, user.passwordHash)) return fail("Your current password is incorrect")

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword), sessionVersion: { increment: 1 } },
    })
    await createSession(updated)
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to change password")
  }
}
