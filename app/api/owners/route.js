import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { NO_OWNER } from "@/lib/owners"

// Stock owners, excluding the built-in "unassigned" row
export async function GET() {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  const owners = await prisma.stockOwner.findMany({
    where: { id: { not: NO_OWNER } },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(owners)
}

export async function POST(req) {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
  }

  try {
    const { name } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: "Owner name required" }, { status: 400 })

    const owner = await prisma.stockOwner.create({ data: { name: name.trim() } })
    return NextResponse.json(owner, { status: 201 })
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "An owner with that name already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to create owner" }, { status: 500 })
  }
}
