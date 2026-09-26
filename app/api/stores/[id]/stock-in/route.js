import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { applyStockIn } from "@/lib/stockIn"
import { NO_OWNER } from "@/lib/owners"

// POST /api/stores/:id/stock-in
// Body: { refNo?, entryDate?, ownerId?, items: [{ productId, rate, quantity, lowStockAt? }] }
// Every item is saved under the same ref no., date and owner, all together or not at all.
export async function POST(req, { params }) {
  const { id } = await params
  let user
  try {
    user = await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
 }

  try {
    const { refNo, entryDate, items, ownerId } = await req.json()

    if (!Array.isArray(items) || items.length === 0)
      return NextResponse.json({ error: "Add at least one item" }, { status: 400 })

    for (const [i, item] of items.entries()) {
      const line = `Line ${i + 1}`
      if (!item.productId || item.rate == null || item.quantity == null)
        return NextResponse.json({ error: `${line}: product, rate and quantity are required` }, { status: 400 })
      if (!Number.isFinite(item.rate) || !Number.isFinite(item.quantity) || item.rate < 0 || item.quantity <= 0)
        return NextResponse.json({ error: `${line}: rate must be 0 or greater, and quantity must be greater than 0` }, { status: 400 })
      if (item.lowStockAt != null && (!Number.isFinite(item.lowStockAt) || item.lowStockAt < 0))
        return NextResponse.json({ error: `${line}: low stock alert must be 0 or greater` }, { status: 400 })
    }

    let parsedDate = entryDate ? new Date(entryDate) : new Date()
    if (isNaN(parsedDate)) parsedDate = new Date()
    if (parsedDate > new Date())
      return NextResponse.json({ error: "Entry date cannot be in the future" }, { status: 400 })

    const store = await prisma.store.findUnique({
      where: { id },
      include: { category: { select: { trackLogs: true, isSystem: true } } },
    })
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })
    if (store.category.isSystem)
      return NextResponse.json({ error: "Opening balances are managed from Manage Products" }, { status: 400 })

    const productIds = [...new Set(items.map(item => item.productId))]
    const found = await prisma.product.count({ where: { id: { in: productIds } } })
    if (found !== productIds.length)
      return NextResponse.json({ error: "One or more products no longer exist" }, { status: 404 })

    const owner = ownerId || NO_OWNER
    if (owner !== NO_OWNER && !(await prisma.stockOwner.findUnique({ where: { id: owner } })))
      return NextResponse.json({ error: "Stock owner not found" }, { status: 404 })

    const logUserId = store.category.trackLogs ? user.id : null
    const ref = refNo?.trim() || null

    await prisma.$transaction(
      tx => applyStockIn(tx, id, items, { refNo: ref, entryDate: parsedDate, userId: logUserId, ownerId: owner }),
      { timeout: 20000 },
    )

    return NextResponse.json({ count: items.length, refNo: ref }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to add stock. No changes were made." }, { status: 500 })
  }
}
