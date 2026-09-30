import prisma from "@/lib/prisma"
import { NO_OWNER, ownerLabel } from "@/lib/owners"
import { MOVEMENT, movementKind, signedChange } from "@/lib/movements"

// A product's live balances and its complete movement history (newest first), optionally
// limited to one owner's stock. Returns null when the product doesn't exist.
// db: the Prisma client, or a transaction.
export async function buildProductHistory(productId, ownerId = null, db = prisma) {
  const byOwner = ownerId ? { ownerId } : {}
  const [product, entries, logs] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, include: { unit: true } }),
    db.stockEntry.findMany({
      where: { productId, isDeleted: false, ...byOwner },
      include: {
        store: { select: { id: true, name: true, category: { select: { name: true, isSystem: true } } } },
        owner: { select: { id: true, name: true } },
      },
    }),
    db.stockLog.findMany({
      where: { productId, ...byOwner },
      include: {
        store: { select: { id: true, name: true, category: { select: { isSystem: true } } } },
        owner: { select: { id: true, name: true } },
        user: { select: { username: true } },
        project: { select: { name: true } },
        recipient: { select: { name: true, company: true } },
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    }),
  ])
  if (!product) return null

  const balances = entries
    .map(e => ({
      id: e.id,
      storeId: e.store.category.isSystem ? null : e.store.id,
      store: e.store.category.isSystem ? "Opening balance" : e.store.name,
      category: e.store.category.isSystem ? "" : e.store.category.name,
      owner: ownerLabel(e.owner),
      quantity: e.quantity,
      rate: e.rate,
      value: e.quantity * e.rate,
    }))
    .sort((a, b) => a.store.localeCompare(b.store) || a.owner.localeCompare(b.owner))

  const rows = logs.map(l => {
    const kind = movementKind(l, l.store.category.isSystem)
    const change = signedChange(l)
    return {
      id: l.id,
      date: l.entryDate,
      kind,
      type: MOVEMENT[kind].label,
      store: l.store.category.isSystem ? "Opening balance" : l.store.name,
      owner: l.ownerId === NO_OWNER ? "—" : l.owner.name,
      change,
      rate: l.rate,
      value: Math.abs(change) * l.rate,
      by: l.user?.username ?? null,
      note: l.note,
      refNo: l.refNo,
      takenBy: l.takenBy,
      destination: l.project?.name ?? (l.recipient ? `${l.recipient.name}${l.recipient.company ? ` (${l.recipient.company})` : ""}` : null),
    }
  })

  return {
    product: { id: product.id, name: product.name, unit: product.unit.name },
    balances,
    rows,
    totalQuantity: balances.reduce((s, b) => s + b.quantity, 0),
    totalValue: balances.reduce((s, b) => s + b.value, 0),
  }
}
