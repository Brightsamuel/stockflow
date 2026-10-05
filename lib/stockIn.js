import { NO_OWNER } from "./owners.js"

// Adds a whole receipt of items to a store inside the caller's transaction.
// Every line gets its own IN log, all sharing the receipt's ref no., date, owner and the names
// typed for its note (delivered by = handedOverBy, received by).
// forProjectId: stock received for a project is kept for it, on its own row; null = general stock.
export async function applyStockIn(tx, storeId, items, {
  refNo = null, entryDate, userId = null, ownerId = NO_OWNER, handedOverBy = null, receivedBy = null, forProjectId = null,
}) {
  const productIds = [...new Set(items.map(item => item.productId))]

  // Load current entries once; the map is kept up to date so the same product can appear on several lines
  const existing = await tx.stockEntry.findMany({ where: { storeId, ownerId, forProjectId, productId: { in: productIds } } })
  const entries = new Map(existing.map(e => [e.productId, e]))

  for (const { productId, rate, quantity, lowStockAt } of items) {
    const current = entries.get(productId)
    let entry
    if (current?.isDeleted) {
      await tx.stockEntry.delete({ where: { id: current.id } })
      entry = await tx.stockEntry.create({
        data: { productId, storeId, ownerId, forProjectId, rate, quantity, lowStockAt: lowStockAt ?? 0 },
      })
    } else if (current) {
      entry = await tx.stockEntry.update({
        where: { id: current.id },
        data: {
          quantity: { increment: quantity },
          rate,
          ...(lowStockAt != null && { lowStockAt }),
        },
      })
    } else {
      entry = await tx.stockEntry.create({
        data: { productId, storeId, ownerId, forProjectId, rate, quantity, lowStockAt: lowStockAt ?? 0 },
      })
    }
    entries.set(productId, entry)
  }

  await tx.stockLog.createMany({
    data: items.map(({ productId, rate, quantity }) => ({
      storeId, productId, type: "IN", quantity, rate, userId, refNo, entryDate, ownerId, handedOverBy, receivedBy, forProjectId,
    })),
  })
}
