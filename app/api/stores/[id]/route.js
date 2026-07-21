import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(req, { params }) {
  try {
    const { id } = await params
    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        items: { orderBy: { createdAt: "asc" } },
      },
    })
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })
    return NextResponse.json({
      ...store,
      items: store.items.map(item => ({ ...item, price: item.rate * item.quantity })),
    })
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch store" }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params
    await prisma.store.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete store" }, { status: 500 })
  }
}