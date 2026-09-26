// Opening balances live in a hidden system store so that issuing them reuses
// the normal transfer flow. The opening IN log is back-dated so it reads as
// stock that has been in the system from the start.

export const OPENING_DATE = new Date("2000-01-01T00:00:00.000Z")
const OPENING_NOTE = "Opening balance"

// Product shape used by Manage Products (page + API) to work out opening left and totals
export const PRODUCT_WITH_BALANCES = {
  unit: true,
  entries: {
    where: { isDeleted: false },
    select: { id: true, storeId: true, quantity: true, rate: true, store: { select: { category: { select: { isSystem: true } } } } },
  },
}

// Validates an optional non-negative number from a request body; undefined means "not sent"
export function parseAmount(value, label) {
  if (value === undefined || value === null || value === "") return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`${label} must be 0 or greater`)
    err.status = 400
    throw err
  }
  return n
}

export async function getOpeningStore(tx) {
  const existing = await tx.store.findFirst({ where: { category: { isSystem: true } } })
  if (existing) return existing

  const category = await tx.category.create({
    data: { name: "Opening balances", isSystem: true, trackLogs: true },
  })
  return tx.store.create({ data: { name: "Opening balance", categoryId: category.id } })
}

// Sets a product's opening balance to `qty` at `rate`. Whatever has already been
// issued from it is preserved, so qty can't drop below that amount.
export async function setOpeningBalance(tx, productId, qty, rate, userId = null) {
  const product = await tx.product.findUnique({ where: { id: productId } })
  const store = await getOpeningStore(tx)
  const entry = await tx.stockEntry.findUnique({
    where: { productId_storeId: { productId, storeId: store.id } },
  })
  const log = await tx.stockLog.findFirst({
    where: { productId, storeId: store.id, type: "IN" },
  })

  const issued = entry ? Math.max(product.openingQty - entry.quantity, 0) : 0
  if (qty < issued) {
    const err = new Error(`${issued} already issued from the opening balance; opening qty can't be less than that`)
    err.status = 400
    throw err
  }

  const remaining = qty - issued

  if (qty === 0 && issued === 0) {
    if (log) await tx.stockLog.delete({ where: { id: log.id } })
    if (entry) await tx.stockEntry.delete({ where: { id: entry.id } })
  } else {
    if (entry) {
      await tx.stockEntry.update({
        where: { id: entry.id },
        data: { quantity: remaining, rate, isDeleted: false, deletedAt: null },
      })
    } else {
      await tx.stockEntry.create({
        data: { productId, storeId: store.id, quantity: remaining, rate },
      })
    }

    if (log) {
      await tx.stockLog.update({ where: { id: log.id }, data: { quantity: qty, rate } })
    } else {
      await tx.stockLog.create({
        data: {
          storeId: store.id, productId, type: "IN", quantity: qty, rate,
          note: OPENING_NOTE, entryDate: OPENING_DATE, userId,
        },
      })
    }
  }

  return tx.product.update({
    where: { id: productId },
    data: { openingQty: qty, openingRate: rate },
  })
}
