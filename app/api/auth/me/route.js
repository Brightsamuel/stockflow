import { getCurrentUser } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json(null)
  return NextResponse.json({ id: user.id, username: user.username, isAdmin: user.isAdmin })
}