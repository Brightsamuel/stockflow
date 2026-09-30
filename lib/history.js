import prisma from "@/lib/prisma"
import { NO_OWNER, ownerLabel } from "@/lib/owners"
import { MOVEMENT, LIVE, movementKind, signedChange } from "@/lib/movements"

// Drops floating-point noise from sums, e.g. 0.1 + 0.2
function clean(n) {
  return Math.abs(n) < 1e-9 ? 0 : Number(n.toPrecision(12))
}

// A product's history for a period, or all of it: every movement with the balance it left in its
// store, the balances per store and owner (opening, added, deducted, adjusted, closing) and a
// summary for the whole product. Optionally limited to one owner's stock. Returns null when the
// product doesn't exist.
//   from / to: Dates, either may be null; db: the Prisma client, or a transaction.
// Summary: opening is the balance before `from` (without `from`, the product's opening balance);
// transfers between stores move stock without changing the total, so
// closing = opening + received − used − issued + adjusted.
export async function buildProductHistory(productId, { ownerId = null, from = null, to = null } = {}, db = prisma) {
  const byOwner = ownerId ? { ownerId } : {}
  const [product, entries, logs] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, include: { unit: true } }),
    db.stockEntry.findMany({ where: { productId, ...byOwner }, select: { storeId: true, ownerId: true, rate: true } }),
    db.stockLog.findMany({
      where: { productId, ...byOwner, ...LIVE },
      include: {
        store: { select: { id: true, name: true, category: { select: { name: true, isSystem: true } } } },
        owner: { select: { id: true, name: true } },
        user: { select: { username: true } },
        project: { select: { name: true } },
        recipient: { select: { name: true, company: true } },
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
  ])
  if (!product) return null

  const currentRates = new Map(entries.map(e => [`${e.storeId}:${e.ownerId}`, e.rate]))
  const lastRates = new Map()
  const running = new Map()
  const balances = new Map()
  const summary = { opening: 0, received: 0, used: 0, issued: 0, transferred: 0, adjusted: 0 }
  const rows = []

  for (const l of logs) {
    const key = `${l.storeId}:${l.ownerId}`
    const system = l.store.category.isSystem
    const kind = movementKind(l, system)
    const change = signedChange(l)
    const balance = clean((running.get(key) ?? 0) + change)
    running.set(key, balance)
    lastRates.set(key, l.rate)
    if (to && l.entryDate > to) continue

    if (!balances.has(key)) {
      balances.set(key, {
        id: key,
        storeId: system ? null : l.storeId,
        store: system ? "Opening balance" : l.store.name,
        category: system ? "" : l.store.category.name,
        owner: ownerLabel(l.owner),
        opening: 0, added: 0, deducted: 0, adjusted: 0,
      })
    }
    const row = balances.get(key)

    if (from && l.entryDate < from) {
      row.opening += change
      summary.opening += change
      continue
    }

    if (l.type === "IN" || l.type === "TRANSFER_IN") row.added += l.quantity
    else if (l.type === "TRANSFER_OUT") row.deducted += l.quantity
    else row.adjusted += change

    if (kind === "OPENING" && !from) summary.opening += change
    else if (kind === "IN" || kind === "OPENING") summary.received += change
    else if (kind === "USED") summary.used -= change
    else if (kind === "ISSUED") summary.issued -= change
    else if (kind === "TRANSFER_OUT") summary.transferred -= change
    else if (kind !== "TRANSFER_IN") summary.adjusted += change

    rows.push({
      id: l.id,
      date: l.entryDate,
      kind,
      type: MOVEMENT[kind].label,
      store: system ? "Opening balance" : l.store.name,
      owner: l.ownerId === NO_OWNER ? "—" : l.owner.name,
      change,
      balance,
      rate: l.rate,
      value: Math.abs(change) * l.rate,
      by: l.user?.username ?? null,
      note: l.note,
      refNo: l.refNo,
      takenBy: l.takenBy,
      destination: l.project?.name ?? (l.recipient ? `${l.recipient.name}${l.recipient.company ? ` (${l.recipient.company})` : ""}` : null),
    })
  }

  const balanceRows = [...balances.values()]
    .map(b => {
      const closing = clean(b.opening + b.added - b.deducted + b.adjusted)
      const rate = currentRates.get(b.id) ?? lastRates.get(b.id) ?? 0
      return {
        ...b,
        opening: clean(b.opening), added: clean(b.added), deducted: clean(b.deducted), adjusted: clean(b.adjusted),
        closing, rate, value: closing * rate,
      }
    })
    .filter(b => b.opening || b.added || b.deducted || b.adjusted || b.closing)
    .sort((a, b) => a.store.localeCompare(b.store) || a.owner.localeCompare(b.owner))

  const closing = clean(balanceRows.reduce((s, b) => s + b.closing, 0))
  return {
    product: { id: product.id, name: product.name, unit: product.unit.name },
    balances: balanceRows,
    rows,
    summary: {
      opening: clean(summary.opening),
      received: clean(summary.received),
      used: clean(summary.used),
      issued: clean(summary.issued),
      transferred: clean(summary.transferred),
      adjusted: clean(summary.adjusted),
      closing,
      closingValue: balanceRows.reduce((s, b) => s + b.value, 0),
      stores: balanceRows.filter(b => b.storeId && b.closing).length,
    },
  }
}
