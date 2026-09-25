import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireAdmin, requireSuperAdmin, hashPassword } from "@/lib/auth"

export async function PATCH(req, { params }) {
  const { id } = await params
  let admin
  try {
    admin = await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const { isActive, password } = await req.json()
    if (isActive == null && !password)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    if (id === admin.id && isActive === false)
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 })

    const data = {}
    if (isActive != null) data.isActive = isActive

    // Admin password reset (users change their own via /api/auth/password)
    if (password) {
      if (password.length < 4)
        return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 })
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
      if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
      if (target.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN")
        return NextResponse.json({ error: "Only Super Admins can reset a Super Admin's password" }, { status: 403 })
      data.passwordHash = hashPassword(password)
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, role: true, isActive: true, createdAt: true },
    })
    return NextResponse.json(user)
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "User not found" }, { status: 404 })
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params
  let admin
  try {
    admin = await requireSuperAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 403 })
  }

  if (id === admin.id)
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 })

  try {
    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "User not found" }, { status: 404 })
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}