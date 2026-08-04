import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(req, { params }) {
  const { id } = await params
    try {
      const store = await prisma.store.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        entries: {
          include: { product: { include: { unit: true } } },
          orderBy: { product: { name: "asc" } },
        },
      },
    })
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })

    // Compute added/deducted totals from StockLog for each entry
    const logs = await prisma.stockLog.groupBy({
      by: ["productId", "type"],
      where: { storeId: id },
      _sum: { quantity: true },
    })

    const logMap = {}
    logs.forEach(l => {
      if (!logMap[l.productId]) logMap[l.productId] = { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }
      logMap[l.productId][l.type] = l._sum.quantity ?? 0
    })

    const entries = store.entries.map(e => {
      const m = logMap[e.productId] ?? { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }
      const totalAdded = m.IN + m.TRANSFER_IN
      const totalDeducted = m.TRANSFER_OUT
      return {
        ...e,
        price: e.rate * e.quantity,
        isLow: e.lowStockAt > 0 && e.quantity <= e.lowStockAt,
        totalAdded,
        totalDeducted,
      }
    })

    return NextResponse.json({ ...store, entries })
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch store" }, { status: 500 })
  }
}

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    const { name } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: "Name required" }, { status: 400 })
    const store = await prisma.store.update({
      where: { id },
      data: { name: name.trim() },
      include: { category: { select: { id: true, name: true } } },
    })
    return NextResponse.json(store)
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Store name already exists in this category" }, { status: 409 })
    return NextResponse.json({ error: "Failed to rename" }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await prisma.store.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete store" }, { status: 500 })
  }
}