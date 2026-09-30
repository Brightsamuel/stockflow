import prisma from "@/lib/prisma"
import { ownerLabel } from "@/lib/owners"
import { MOVEMENT, ADJUST_TYPES, LIVE, movementKind, signedChange } from "@/lib/movements"

const ownerSelect = { select: { id: true, name: true } }
const storeSelect = { select: { id: true, name: true, category: { select: { name: true, isSystem: true } } } }

function storeLabel(store) {
  return store.category.isSystem ? "Opening balance" : store.name
}

function recipientLabel(recipient) {
  return recipient ? `${recipient.name}${recipient.company ? ` (${recipient.company})` : ""}` : null
}

function logSums(db, where) {
  return db.stockLog.groupBy({
    by: ["storeId", "productId", "ownerId", "type"],
    where: { ...where, ...LIVE },
    _sum: { quantity: true, adjustment: true },
  })
}

// Grouped log sums keyed by `${storeId}:${productId}:${ownerId}` -> { IN, TRANSFER_IN, TRANSFER_OUT, ADJ }
function foldLogs(rows) {
  const map = {}
  rows.forEach(r => {
    const key = `${r.storeId}:${r.productId}:${r.ownerId}`
    map[key] ??= { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJ: 0 }
    if (ADJUST_TYPES.includes(r.type)) map[key].ADJ += r._sum.adjustment ?? 0
    else if (r.type in map[key]) map[key][r.type] += r._sum.quantity ?? 0
  })
  return map
}

const NO_SUMS = { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJ: 0 }

// Opening / added / deducted / adjusted / closing per store, product and owner for a period.
// Closing value uses each row's current rate. ownerId (optional) limits it to one owner's stock.
// db: the Prisma client, or a transaction.
export async function buildReport(storeIds, from, to, ownerId = null, db = prisma) {
  const byOwner = ownerId ? { ownerId } : {}
  const [beforeRows, rangeRows, entries] = await Promise.all([
    logSums(db, { storeId: { in: storeIds }, entryDate: { lt: from }, ...byOwner }),
    logSums(db, { storeId: { in: storeIds }, entryDate: { gte: from, lte: to }, ...byOwner }),
    db.stockEntry.findMany({
      where: { storeId: { in: storeIds }, ...byOwner },
      select: { storeId: true, productId: true, ownerId: true, rate: true },
    }),
  ])

  const beforeMap = foldLogs(beforeRows)
  const rangeMap = foldLogs(rangeRows)
  const rates = new Map(entries.map(e => [`${e.storeId}:${e.productId}:${e.ownerId}`, e.rate]))

  const productIds = new Set()
  const ownerIds = new Set()
  const rows = []
  new Set([...Object.keys(beforeMap), ...Object.keys(rangeMap)]).forEach(key => {
    const [storeId, productId, rowOwnerId] = key.split(":")
    const b = beforeMap[key] ?? NO_SUMS
    const r = rangeMap[key] ?? NO_SUMS

    const opening = b.IN + b.TRANSFER_IN - b.TRANSFER_OUT + b.ADJ
    const added = r.IN + r.TRANSFER_IN
    const deducted = r.TRANSFER_OUT
    const adjusted = r.ADJ
    const closing = opening + added - deducted + adjusted
    // Nothing to report for rows with no stock and no activity
    if (!opening && !added && !deducted && !adjusted && !closing) return

    const rate = rates.get(key) ?? null
    productIds.add(productId)
    ownerIds.add(rowOwnerId)
    rows.push({
      storeId, productId, ownerId: rowOwnerId,
      opening, added, deducted, adjusted, closing,
      rate, closingValue: rate == null ? null : closing * rate,
    })
  })

  const [products, stores, owners] = await Promise.all([
    db.product.findMany({ where: { id: { in: [...productIds] } }, include: { unit: true } }),
    db.store.findMany({ where: { id: { in: storeIds } }, ...storeSelect }),
    db.stockOwner.findMany({ where: { id: { in: [...ownerIds] } }, ...ownerSelect }),
  ])
  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s]))
  const ownerMap = Object.fromEntries(owners.map(o => [o.id, o]))

  return rows
    .map(row => ({
      ...row,
      productName: productMap[row.productId]?.name ?? "Unknown product",
      unit: productMap[row.productId]?.unit.name ?? "",
      storeName: storeMap[row.storeId] ? storeLabel(storeMap[row.storeId]) : "Unknown store",
      categoryName: storeMap[row.storeId]?.category.name ?? "",
      ownerName: ownerLabel(ownerMap[row.ownerId]),
    }))
    .sort((a, b) =>
      a.storeName.localeCompare(b.storeName) ||
      a.productName.localeCompare(b.productName) ||
      a.ownerName.localeCompare(b.ownerName))
}

export async function buildRecipientReport(recipientId, from, to, ownerId = null) {
  const logs = await prisma.stockLog.findMany({
    where: {
      ...LIVE,
      recipientId: recipientId || { not: null },
      entryDate: { gte: from, lte: to },
      ...(ownerId && { ownerId }),
    },
    include: {
      store: storeSelect,
      product: { include: { unit: true } },
      recipient: { select: { id: true, name: true, company: true } },
      user: { select: { username: true } },
      owner: ownerSelect,
    },
    orderBy: { entryDate: "desc" },
  })

  return logs.map(l => ({
    date: l.entryDate,
    refNo: l.refNo,
    store: storeLabel(l.store),
    category: l.store.category.name,
    product: l.product.name,
    unit: l.product.unit.name,
    owner: ownerLabel(l.owner),
    quantity: l.quantity,
    rate: l.rate,
    value: l.quantity * l.rate,
    recipientName: l.recipient?.name ?? "Unknown",
    recipientCompany: l.recipient?.company ?? "",
    takenBy: l.takenBy,
    issuedBy: l.user?.username ?? null,
  }))
}

// Field records: stock issued to projects (used in the field).
// takenBy (optional) matches any part of the collector's name, e.g. one person's history.
export async function buildProjectReport(projectId, from, to, ownerId = null, takenBy = null) {
  const logs = await prisma.stockLog.findMany({
    where: {
      ...LIVE,
      type: "TRANSFER_OUT",
      projectId: projectId || { not: null },
      entryDate: { gte: from, lte: to },
      ...(ownerId && { ownerId }),
      ...(takenBy && { takenBy: { contains: takenBy, mode: "insensitive" } }),
    },
    include: {
      store: storeSelect,
      product: { include: { unit: true } },
      project: { select: { name: true } },
      user: { select: { username: true } },
      owner: ownerSelect,
    },
    orderBy: { entryDate: "desc" },
  })

  return logs.map(l => ({
    date: l.entryDate,
    refNo: l.refNo,
    project: l.project?.name ?? "Unknown",
    store: storeLabel(l.store),
    category: l.store.category.name,
    product: l.product.name,
    unit: l.product.unit.name,
    owner: ownerLabel(l.owner),
    quantity: l.quantity,
    rate: l.rate,
    value: l.quantity * l.rate,
    takenBy: l.takenBy,
    issuedBy: l.user?.username ?? null,
  }))
}

// Every line recorded under a ref no., oldest first
export async function buildRefReport(refNo) {
  const logs = await prisma.stockLog.findMany({
    where: { refNo, ...LIVE },
    include: {
      store: storeSelect,
      product: { include: { unit: true } },
      user: { select: { username: true } },
      owner: ownerSelect,
      project: { select: { name: true } },
      recipient: { select: { name: true, company: true } },
    },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
  })

  return logs.map(l => {
    const kind = movementKind(l, l.store.category.isSystem)
    return {
      date: l.entryDate,
      store: storeLabel(l.store),
      category: l.store.category.name,
      product: l.product.name,
      unit: l.product.unit.name,
      owner: ownerLabel(l.owner),
      quantity: l.quantity,
      rate: l.rate,
      value: l.quantity * l.rate,
      type: l.type,
      kind,
      typeLabel: MOVEMENT[kind].label,
      destination: l.project?.name ?? recipientLabel(l.recipient),
      takenBy: l.takenBy,
      note: l.note,
      addedBy: l.user?.username ?? null,
    }
  })
}

// Movement ledger: every movement in a period, oldest first, optionally narrowed by type
const LEDGER_WHERE = {
  received: { type: "IN" },
  transfers: { type: { in: ["TRANSFER_IN", "TRANSFER_OUT"] }, projectId: null, recipientId: null },
  used: { type: "TRANSFER_OUT", projectId: { not: null } },
  issued: { type: "TRANSFER_OUT", recipientId: { not: null } },
  adjustments: { type: { in: ADJUST_TYPES } },
}

export async function buildLedgerReport({ storeIds = null, from, to, ownerId = null, type = "", db = prisma }) {
  const logs = await db.stockLog.findMany({
    where: {
      ...LIVE,
      entryDate: { gte: from, lte: to },
      ...(storeIds && { storeId: { in: storeIds } }),
      ...(ownerId && { ownerId }),
      ...(LEDGER_WHERE[type] ?? {}),
    },
    include: {
      store: storeSelect,
      product: { include: { unit: true } },
      owner: ownerSelect,
      user: { select: { username: true } },
    },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
  })

  return logs.map(l => {
    const kind = movementKind(l, l.store.category.isSystem)
    const change = signedChange(l)
    return {
      date: l.entryDate,
      refNo: l.refNo,
      kind,
      typeLabel: MOVEMENT[kind].label,
      store: storeLabel(l.store),
      product: l.product.name,
      unit: l.product.unit.name,
      owner: ownerLabel(l.owner),
      change,
      rate: l.rate,
      value: Math.abs(change) * l.rate,
      details: l.note,
      by: l.user?.username ?? null,
    }
  })
}

// Items at or below their low-stock alert right now
export async function buildLowStockReport({ storeIds = null, ownerId = null }) {
  const entries = await prisma.stockEntry.findMany({
    where: {
      isDeleted: false,
      lowStockAt: { gt: 0 },
      store: { category: { isSystem: false } },
      ...(storeIds && { storeId: { in: storeIds } }),
      ...(ownerId && { ownerId }),
    },
    include: {
      store: storeSelect,
      product: { include: { unit: true } },
      owner: ownerSelect,
    },
  })

  return entries
    .filter(e => e.quantity <= e.lowStockAt)
    .map(e => {
      const shortBy = Math.max(e.lowStockAt - e.quantity, 0)
      return {
        storeId: e.storeId,
        productId: e.productId,
        store: e.store.name,
        category: e.store.category.name,
        product: e.product.name,
        unit: e.product.unit.name,
        owner: ownerLabel(e.owner),
        quantity: e.quantity,
        lowStockAt: e.lowStockAt,
        shortBy,
        rate: e.rate,
        restockValue: shortBy * e.rate,
      }
    })
    .sort((a, b) => a.store.localeCompare(b.store) || a.product.localeCompare(b.product))
}
