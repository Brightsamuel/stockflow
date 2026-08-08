import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"

// POST /api/stores/:id/stock-in
// Body: { productId, rate, quantity, lowStockAt? }
export async function POST(req, { params }) {
  const { id } = await params
  let user
  try {
    user = await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
 }

  try {
    const { productId, rate, quantity, lowStockAt } = await req.json()

    if (!productId || rate == null || quantity == null)
      return NextResponse.json({ error: "productId, rate and quantity are required" }, { status: 400 })
    if (rate <= 0 || quantity <= 0)
      return NextResponse.json({ error: "Rate and quantity must be greater than 0" }, { status: 400 })

    const store = await prisma.store.findUnique({
      where: { id },
      include: { category: { select: { trackLogs: true } } },
    })
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })

    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    const logUserId = store.category.trackLogs ? user.id : null

    const result = await prisma.$transaction(async (tx) => {
      // Upsert the stock entry — create or update quantity
      const existing = await tx.stockEntry.findUnique({
        where: { productId_storeId: { productId, storeId: id } },
      })

      let entry
      if (existing) {
        entry = await tx.stockEntry.update({
          where: { id: existing.id },
          data: {
            quantity: { increment: quantity },
            rate, // update rate to the latest stock-in rate
            ...(lowStockAt != null && { lowStockAt }),
          },
        })
      } else {
        entry = await tx.stockEntry.create({
          data: {
            productId,
            storeId: id,
            rate,
            quantity,
            lowStockAt: lowStockAt ?? 0,
          },
        })
      }

      // Write to stock log
      await tx.stockLog.create({
        data: {
          storeId: id,
          productId,
          type: "IN",
          quantity,
          rate,
          userId: logUserId,
        },
      })

      return entry
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to add stock" }, { status: 500 })
  }
}