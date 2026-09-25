import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser, verifyPassword, hashPassword } from "@/lib/auth"

// Change the signed-in user's own password
export async function POST(req) {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const { currentPassword, newPassword } = await req.json()
    if (!currentPassword || !newPassword)
      return NextResponse.json({ error: "Current and new password required" }, { status: 400 })
    if (newPassword.length < 4)
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 })
    if (!verifyPassword(currentPassword, user.passwordHash))
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 })
  }
}
