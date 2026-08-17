import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"

export async function GET() {
  const recipients = await prisma.recipient.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(recipients)
}

export async function POST(req) {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
  }

  try {
    const { name, company } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: "Name required" }, { status: 400 })

    const recipient = await prisma.recipient.create({
      data: { name: name.trim(), company: company?.trim() || null },
    })
    return NextResponse.json(recipient, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create recipient" }, { status: 500 })
  }
}