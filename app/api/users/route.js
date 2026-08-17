import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireAdmin, hashPassword } from "@/lib/auth"

export async function GET() {
  try {
    await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(users)
}

export async function POST(req) {
  let actor
  try {
    actor = await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const { username, password, role } = await req.json()
    if (!username?.trim() || !password)
      return NextResponse.json({ error: "Username and password required" }, { status: 400 })
    if (password.length < 4)
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 })

    const validRoles = ["STANDARD", "ADMIN", "SUPER_ADMIN"]
    const requestedRole = validRoles.includes(role) ? role : "STANDARD"

    if (requestedRole === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only Super Admins can assign the SUPER_ADMIN role" },
        { status: 403 }
      )
    }

    if (actor.role === "ADMIN" && requestedRole === "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only Super Admins can assign the SUPER_ADMIN role" },
        { status: 403 }
      )
    }

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        passwordHash: hashPassword(password),
        role: requestedRole,
      },
      select: { id: true, username: true, role: true, isActive: true, createdAt: true },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Username already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
  }
}