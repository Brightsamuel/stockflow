import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      include: {
        stores: {
          include: { _count: { select: { items: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json(categories)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { name } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const category = await prisma.category.create({ data: { name: name.trim() } })
    return NextResponse.json(category, { status: 201 })
  } catch (e) {
    if (e.code === "P2002") return NextResponse.json({ error: "Category already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}