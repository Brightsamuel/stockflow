import prisma from "@/lib/prisma"
import { requireEditor } from "@/lib/auth"
import { json, fail, handleError, parseEntryDate, personName } from "@/lib/http"
import { applyStockIn } from "@/lib/stockIn"
import { NO_OWNER } from "@/lib/owners"
import { recentStockIn, savedAgo } from "@/lib/duplicates"

// POST /api/stores/:id/stock-in
// Body: { refNo?, entryDate?, ownerId?, forProjectId?, deliveredBy?, receivedBy?, items: [{ productId, rate, quantity, lowStockAt? }],
//         confirmDuplicate? }   (forProjectId: stock received for a project is kept for it)
// Every item is saved under the same ref no., date and owner, all together or not at all.
// The same receipt saved again within a few minutes returns 409 { duplicate: true } unless
// confirmDuplicate is set.
export async function POST(req, { params }) {
  const { id } = await params
  try {
    const user = await requireEditor()
    const { refNo, entryDate, items, ownerId, forProjectId, confirmDuplicate, deliveredBy, receivedBy } = await req.json()
    const names = { handedOverBy: personName(deliveredBy, "Delivered by"), receivedBy: personName(receivedBy, "Received by") }

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

    const project = forProjectId || null
    if (project && !(await prisma.project.findUnique({ where: { id: project } })))
      return fail("Project not found", 404)

    const ref = refNo?.trim() || null
    if (!confirmDuplicate) {
      const earlier = await recentStockIn(prisma, { storeId: id, ownerId: owner, forProjectId: project, refNo: ref, items })
      if (earlier) {
        return json({
          duplicate: true,
          error: `The same ${items.length === 1 ? "item was" : `${items.length} items were`} received into ${store.name}${ref ? ` under ${ref}` : ""} ${savedAgo(earlier)}. Saving again adds ${items.length === 1 ? "it" : "them"} a second time.`,
        }, 409)
      }
    }

    await prisma.$transaction(
      tx => applyStockIn(tx, id, items, {
        refNo: ref,
        entryDate: date,
        userId: store.category.trackLogs ? user.id : null,
        ownerId: owner,
        forProjectId: project,
        ...names,
      }),
      { timeout: 20000 },
    )
    return json({ count: items.length, refNo: ref }, 201)
  } catch (e) {
    return handleError(e, "Failed to add stock. No changes were made.")
  }
}
