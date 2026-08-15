import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { requireSuperAdmin } from "@/lib/auth"

export async function PATCH(req, { params }) {
  const { id } = await params
  let admin
  try {
    admin = await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const { isActive } = await req.json()
    if (isActive == null)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    if (id === admin.id && isActive === false)
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 })

    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, username: true, isAdmin: true, isActive: true, createdAt: true },
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