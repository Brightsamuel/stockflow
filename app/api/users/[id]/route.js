import prisma from "@/lib/prisma"
import { requireAdmin, requireSuperAdmin, hashPassword } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { getUserRow } from "@/lib/users"
import { userActivity } from "@/lib/guards"
import { MIN_PASSWORD_LENGTH, ROLES } from "@/lib/constants"

// Body: { isActive? } to deactivate / reactivate, { password? } to reset it, { unlock: true }
// to clear a sign-in lockout, { role?, canApprove? } to change what they may do.
// Deactivating or resetting ends the user's sessions.
export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    const admin = await requireAdmin()
    const { isActive, password, unlock, role, canApprove } = await req.json()
    if (isActive == null && !password && !unlock && role == null && canApprove == null) return fail("Nothing to update")

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    if (!target) return fail("User not found", 404)
    if (target.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN")
      return fail("Only a Super admin can change a Super admin's account", 403)
    if (id === admin.id && isActive === false) return fail("You cannot deactivate your own account")

    const data = {}
    if (role != null && role !== target.role) {
      if (!ROLES.includes(role)) return fail("Unknown role")
      if (id === admin.id) return fail("You cannot change your own role")
      if (role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") return fail("Only a Super admin can make someone a Super admin", 403)
      data.role = role
    }
    if (canApprove != null) data.canApprove = Boolean(canApprove)
    if (isActive != null) {
      data.isActive = Boolean(isActive)
      if (!isActive) data.sessionVersion = { increment: 1 }
    }
    if (password) {
      if (password.length < MIN_PASSWORD_LENGTH)
        return fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      data.passwordHash = hashPassword(password)
      data.sessionVersion = { increment: 1 }
    }
    if (password || unlock) {
      data.failedLogins = 0
      data.lockedUntil = null
    }

    await prisma.user.update({ where: { id }, data })
    return json(await getUserRow(id))
  } catch (e) {
    return handleError(e, "Failed to update user", { P2025: "User not found" })
  }
}

// Only accounts that never recorded anything can be deleted, so every record keeps its author
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    const admin = await requireSuperAdmin()
    if (id === admin.id) return fail("You cannot delete your own account")

    if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) return fail("User not found", 404)
    if ((await userActivity(prisma, id)) > 0)
      return fail("This user has recorded stock activity, so the account can't be deleted. Deactivate it instead.", 409)

    await prisma.user.delete({ where: { id } })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete user", { P2025: "User not found" })
  }
}
