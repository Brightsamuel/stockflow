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
// Summary: opening is the balance before `from`, plus the product's opening balance (whether or
// not it has been issued to stores since: opening stock was on hand from the start). Transfers
// between stores move stock without changing the total, so
// closing = opening + received − used − issued + returned + adjusted.
export async function buildProductHistory(productId, { ownerId = null, from = null, to = null } = {}, db = prisma) {
  const byOwner = ownerId ? { ownerId } : {}
  const [product, entries, logs] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, include: { unit: true } }),
    db.stockEntry.findMany({ where: { productId, ...byOwner }, select: { storeId: true, ownerId: true, forProjectId: true, rate: true } }),
    db.stockLog.findMany({
      where: { productId, ...byOwner, ...LIVE },
      include: {
        store: { select: { id: true, name: true, category: { select: { name: true, isSystem: true } } } },
        owner: { select: { id: true, name: true } },
        user: { select: { username: true } },
        project: { select: { name: true } },
        forProject: { select: { name: true } },
        recipient: { select: { name: true, company: true } },
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
  ])
  if (!product) return null

  // A store row: owner, and the project its stock is kept for (if any)
  const rowKey = r => `${r.storeId}:${r.ownerId}:${r.forProjectId ?? ""}`
  const currentRates = new Map(entries.map(e => [rowKey(e), e.rate]))
  const lastRates = new Map()
  const running = new Map()
  const balances = new Map()
  const summary = { opening: 0, received: 0, used: 0, issued: 0, returned: 0, transferred: 0, adjusted: 0 }
  const rows = []

  for (const l of logs) {
    const key = rowKey(l)
    const system = l.store.category.isSystem
    const storeName = system ? null : `${l.store.name}${l.forProject ? ` · kept for ${l.forProject.name}` : ""}`
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
        store: system ? "Opening stock not yet in a store" : storeName,
        category: system ? "" : l.store.category.name,
        owner: ownerLabel(l.owner),
        opening: 0, added: 0, deducted: 0, adjusted: 0,
      })
    }
    const row = balances.get(key)
    const before = Boolean(from && l.entryDate < from)

    // Opening balances, and opening stock issued from them to a store, are stock on hand from
    // the start: they count under Opening whatever the period
    if (before || l.openingStock || kind === "OPENING") {
      row.opening += change
      summary.opening += change
    } else {
      if (l.type === "IN" || l.type === "TRANSFER_IN" || l.type === "RETURN") row.added += l.quantity
      else if (l.type === "TRANSFER_OUT") row.deducted += l.quantity
      else row.adjusted += change

      if (kind === "IN") summary.received += change
      else if (kind === "USED") summary.used -= change
      else if (kind === "ISSUED") summary.issued -= change
      else if (kind === "RETURNED") summary.returned += change
      else if (kind === "TRANSFER_OUT") summary.transferred -= change
      else if (kind !== "TRANSFER_IN") summary.adjusted += change
    }

    // Listed: movements in the period. An issue of opening stock shows once, on the store that
    // received it; its opening-balance side is left out of the list.
    if (before || kind === "OPENING_ISSUED") continue

    rows.push({
      id: l.id,
      date: l.entryDate,
      kind,
      type: MOVEMENT[kind].label,
      store: system ? "Opening balance" : storeName,
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
      returned: clean(summary.returned),
      transferred: clean(summary.transferred),
      adjusted: clean(summary.adjusted),
      closing,
      closingValue: balanceRows.reduce((s, b) => s + b.value, 0),
      stores: balanceRows.filter(b => b.storeId && b.closing).length,
    },
  }
}
