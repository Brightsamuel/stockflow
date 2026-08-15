import prisma from "@/lib/prisma"
import { verifyPassword, hashPassword, createSession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function POST(req) {
  try {
    const { username, password } = await req.json()
    if (!username?.trim() || !password)
      return NextResponse.json({ error: "Username and password required" }, { status: 400 })

    const userCount = await prisma.user.count()
    if (userCount === 0) {
      const admin = await prisma.user.create({
        data: {
          username: username.trim(),
          passwordHash: hashPassword(password),
          role: "SUPER_ADMIN",
        },
      })
      await createSession(admin.id)
      return NextResponse.json({ id: admin.id, username: admin.username, role: admin.role, bootstrapped: true })
    }

    const user = await prisma.user.findUnique({ where: { username: username.trim() } })
    if (!user || !verifyPassword(password, user.passwordHash))
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 })

    await createSession(user.id)
    return NextResponse.json({ id: user.id, username: user.username, role: user.role })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}