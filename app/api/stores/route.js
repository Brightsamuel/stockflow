import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const categoryId = searchParams.get("categoryId")
    const stores = await prisma.store.findMany({
      where: categoryId ? { categoryId } : undefined,
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json(stores)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch stores" }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { name, categoryId } = await req.json()
    if (!name?.trim() || !categoryId)
      return NextResponse.json({ error: "Name and categoryId are required" }, { status: 400 })
    const store = await prisma.store.create({
      data: { name: name.trim(), categoryId },
      include: { category: { select: { id: true, name: true } } },
    })
    return NextResponse.json(store, { status: 201 })
  } catch (e) {
    if (e.code === "P2002") return NextResponse.json({ error: "Store name already exists in this category" }, { status: 409 })
    return NextResponse.json({ error: "Failed to create store" }, { status: 500 })
  }
}