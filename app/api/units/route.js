import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const units = await prisma.unit.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(units)
}

export async function POST(req) {
  try {
    const { name } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: "Name required" }, { status: 400 })
    const unit = await prisma.unit.create({ data: { name: name.trim().toLowerCase() } })
    return NextResponse.json(unit, { status: 201 })
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Unit already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to create unit" }, { status: 500 })
  }
}