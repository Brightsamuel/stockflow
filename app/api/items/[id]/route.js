import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function PUT(req, { params }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = {}
    if (body.name != null) data.name = body.name.trim()
    if (body.unit != null) data.unit = body.unit.trim()
    if (body.rate != null) {
      if (body.rate <= 0) return NextResponse.json({ error: "Rate must be > 0" }, { status: 400 })
      data.rate = body.rate
    }
    if (body.quantity != null) {
      if (body.quantity < 0) return NextResponse.json({ error: "Quantity cannot be negative" }, { status: 400 })
      data.quantity = body.quantity
    }
    if (body.lowStockAt != null) data.lowStockAt = body.lowStockAt

    if (!Object.keys(data).length)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    const item = await prisma.item.update({ where: { id }, data })
    return NextResponse.json({ ...item, price: item.rate * item.quantity })
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Item not found" }, { status: 404 })
    if (e.code === "P2002") return NextResponse.json({ error: "Item name already exists in this store" }, { status: 409 })
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params
    await prisma.item.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Item not found" }, { status: 404 })
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 })
  }
}