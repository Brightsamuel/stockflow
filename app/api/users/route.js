import prisma from "@/lib/prisma"
import { requireAdmin, hashPassword } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { listUsers, getUserRow } from "@/lib/users"
import { MIN_PASSWORD_LENGTH, ROLES } from "@/lib/constants"

export async function GET() {
  try {
    await requireAdmin()
    return json(await listUsers())
  } catch (e) {
    return handleError(e, "Failed to load users")
  }
}

export async function POST(req) {
  try {
    const actor = await requireAdmin()
    const { username, password, role } = await req.json()
    if (!username?.trim() || !password) return fail("Enter a username and a password")
    if (password.length < MIN_PASSWORD_LENGTH)
      return fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters`)

    const requestedRole = ROLES.includes(role) ? role : "STANDARD"
    if (requestedRole === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN")
      return fail("Only a Super admin can create another Super admin", 403)

    const user = await prisma.user.create({
      data: { username: username.trim(), passwordHash: hashPassword(password), role: requestedRole },
    })
    return json(await getUserRow(user.id), 201)
  } catch (e) {
    return handleError(e, "Failed to create user", { P2002: "That username is already taken" })
  }
}
