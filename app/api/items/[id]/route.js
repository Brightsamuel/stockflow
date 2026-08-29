import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser, requireSuperAdmin } from "@/lib/auth"

export async function PUT(req, { params }) {
  const { id } = await params
  let user
  try {
    user = await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const data = {}
    if (body.rate != null) {
      if (body.rate < 0) return NextResponse.json({ error: "Rate cannot be negative" }, { status: 400 })
      data.rate = body.rate
    }
    if (body.quantity != null) {
      if (body.quantity < 0) return NextResponse.json({ error: "Quantity cannot be negative" }, { status: 400 })
      data.quantity = body.quantity
    }
    if (body.lowStockAt != null) data.lowStockAt = body.lowStockAt

    if (!Object.keys(data).length)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    const existing = await prisma.stockEntry.findUnique({
      where: { id },
      include: { store: { include: { category: { select: { trackLogs: true } } } } },
    })
    if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 })

    const logUserId = existing.store.category.trackLogs ? user.id : null

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.stockEntry.update({ where: { id }, data })

      const changes = []
      if (data.rate != null) changes.push(`rate ${existing.rate} → ${data.rate}`)
      if (data.quantity != null) changes.push(`quantity ${existing.quantity} → ${data.quantity}`)
      if (data.lowStockAt != null) changes.push(`low stock alert ${existing.lowStockAt} → ${data.lowStockAt}`)

      await tx.stockLog.create({
        data: {
          storeId: existing.storeId,
          productId: existing.productId,
          type: "EDIT",
          quantity: entry.quantity,
          rate: entry.rate,
          note: changes.join(", "),
          userId: logUserId,
        },
      })

      return entry
    })

    return NextResponse.json({ ...result, price: result.rate * result.quantity })
  } catch (e) {
    if (e.code === "P2025") return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params
  let user
  try {
    user = await requireSuperAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 403 })
  }

  try {
    const existing = await prisma.stockEntry.findUnique({
      where: { id },
      include: { store: { include: { category: { select: { trackLogs: true } } } } },
    })
    if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    if (existing.isDeleted) return NextResponse.json({ error: "Already deleted" }, { status: 400 })

    const logUserId = existing.store.category.trackLogs ? user.id : null

    await prisma.$transaction(async (tx) => {
      await tx.stockLog.create({
        data: {
          storeId: existing.storeId,
          productId: existing.productId,
          type: "DELETE",
          quantity: existing.quantity,
          rate: existing.rate,
          note: `Entry removed (was ${existing.quantity} @ ${existing.rate})`,
          userId: logUserId,
        },
      })
      await tx.stockEntry.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
      })
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}