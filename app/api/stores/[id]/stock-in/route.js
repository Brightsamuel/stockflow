import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function POST(req, { params }) {
  try {
    const { id } = await params
    const { name, unit, rate, quantity, lowStockAt } = await req.json()

    if (!name?.trim() || !unit?.trim() || rate == null || quantity == null)
      return NextResponse.json({ error: "name, unit, rate and quantity are required" }, { status: 400 })
    if (rate <= 0 || quantity <= 0)
      return NextResponse.json({ error: "rate and quantity must be greater than 0" }, { status: 400 })

    const store = await prisma.store.findUnique({ where: { id } })
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })

    const existing = await prisma.item.findUnique({
      where: { name_storeId: { name: name.trim(), storeId: id } },
    })

    let item
    if (existing) {
      // Already exists — add to quantity only
      item = await prisma.item.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
      })
    } else {
      // New item — create with lowStockAt threshold
      item = await prisma.item.create({
        data: {
          name: name.trim(),
          unit: unit.trim(),
          rate,
          quantity,
          lowStockAt: lowStockAt ?? 0,
          storeId: id,
        },
      })
    }

    return NextResponse.json({ ...item, price: item.rate * item.quantity }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to add stock" }, { status: 500 })
  }
}