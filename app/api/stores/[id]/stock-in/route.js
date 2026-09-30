import prisma from "@/lib/prisma"
import { requireUser } from "@/lib/auth"
import { json, fail, handleError, parseEntryDate } from "@/lib/http"
import { applyStockIn } from "@/lib/stockIn"
import { NO_OWNER } from "@/lib/owners"

// POST /api/stores/:id/stock-in
// Body: { refNo?, entryDate?, ownerId?, items: [{ productId, rate, quantity, lowStockAt? }] }
// Every item is saved under the same ref no., date and owner, all together or not at all.
export async function POST(req, { params }) {
  const { id } = await params
  try {
    const user = await requireUser()
    const { refNo, entryDate, items, ownerId } = await req.json()

    if (!Array.isArray(items) || items.length === 0) return fail("Add at least one item")
    for (const [i, item] of items.entries()) {
      const line = `Line ${i + 1}`
      if (!item.productId || item.rate == null || item.quantity == null)
        return fail(`${line}: product, rate and quantity are required`)
      if (!Number.isFinite(item.rate) || !Number.isFinite(item.quantity) || item.rate < 0 || item.quantity <= 0)
        return fail(`${line}: rate must be 0 or more, and quantity more than 0`)
      if (item.lowStockAt != null && (!Number.isFinite(item.lowStockAt) || item.lowStockAt < 0))
        return fail(`${line}: the low stock alert must be 0 or more`)
    }
    const date = parseEntryDate(entryDate)

    const store = await prisma.store.findUnique({
      where: { id },
      include: { category: { select: { trackLogs: true, isSystem: true } } },
    })
    if (!store) return fail("Store not found", 404)
    if (store.category.isSystem) return fail("Opening balances are managed from Products")

    const productIds = [...new Set(items.map(item => item.productId))]
    if ((await prisma.product.count({ where: { id: { in: productIds } } })) !== productIds.length)
      return fail("One or more products no longer exist", 404)

    const owner = ownerId || NO_OWNER
    if (owner !== NO_OWNER && !(await prisma.stockOwner.findUnique({ where: { id: owner } })))
      return fail("Stock owner not found", 404)

    const ref = refNo?.trim() || null
    await prisma.$transaction(
      tx => applyStockIn(tx, id, items, {
        refNo: ref,
        entryDate: date,
        userId: store.category.trackLogs ? user.id : null,
        ownerId: owner,
      }),
      { timeout: 20000 },
    )
    return json({ count: items.length, refNo: ref }, 201)
  } catch (e) {
    return handleError(e, "Failed to add stock. No changes were made.")
  }
}
