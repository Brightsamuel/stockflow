import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"

export async function PUT(req, { params }) {
  const { id } = await params
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const data = {}
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

    const entry = await prisma.stockEntry.update({ where: { id }, data })
    return NextResponse.json({ ...entry, price: entry.rate * entry.quantity })
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
  }

  try {
    await prisma.stockEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}