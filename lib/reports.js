import prisma from "@/lib/prisma"
import { ownerLabel } from "@/lib/owners"
import { MOVEMENT, ADJUST_TYPES, LIVE, movementKind, signedChange } from "@/lib/movements"

const ownerSelect = { select: { id: true, name: true } }
const storeSelect = { select: { id: true, name: true, category: { select: { name: true, isSystem: true } } } }

function storeLabel(store) {
  return store.category.isSystem ? "Opening balance" : store.name
}

// "Approved by" on stock-out report lines: the approver, or where the line stands
const approvalSelect = { select: { status: true, user: { select: { username: true } } } }
function approvedBy(log) {
  if (log.approval?.status === "APPROVED") return log.approval.user?.username ?? "Approved"
  return log.approval?.status === "QUERIED" ? "Queried" : "Awaiting approval"
}

function recipientLabel(recipient) {
  return recipient ? `${recipient.name}${recipient.company ? ` (${recipient.company})` : ""}` : null
}

function logSums(db, where) {
  return db.stockLog.groupBy({
    by: ["storeId", "productId", "ownerId", "forProjectId", "type"],
    where: { ...where, ...LIVE },
    _sum: { quantity: true, adjustment: true },
  })
}

// A store row: store, product, owner and the project its stock is kept for (empty = general)
const rowKey = r => `${r.storeId}:${r.productId}:${r.ownerId}:${r.forProjectId ?? ""}`

// Grouped log sums keyed by rowKey -> { IN, TRANSFER_IN, TRANSFER_OUT, ADJ }; a return from a
// project counts as stock coming in
function foldLogs(rows) {
  const map = {}
  rows.forEach(r => {
    const key = rowKey(r)
    map[key] ??= { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJ: 0 }
    if (ADJUST_TYPES.includes(r.type)) map[key].ADJ += r._sum.adjustment ?? 0
    else if (r.type === "RETURN") map[key].IN += r._sum.quantity ?? 0
    else if (r.type in map[key]) map[key][r.type] += r._sum.quantity ?? 0
  })
  return map
}

const NO_SUMS = { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, ADJ: 0 }

// Stock on hand from the start, whatever the period: lines dated before it, opening stock issued
// to a store (even when issued later, it was already owned) and opening balances themselves
function onHandBefore(from) {
  return { OR: [{ entryDate: { lt: from } }, { openingStock: true }, { type: "IN", store: { category: { isSystem: true } } }] }
}
const IN_PERIOD = { openingStock: false, NOT: { type: "IN", store: { category: { isSystem: true } } } }

// Opening / added / deducted / adjusted / closing per store, product and owner for a period.
// Opening stock issued from an opening balance counts under Opening for any period.
// Closing value uses each row's current rate. ownerId (optional) limits it to one owner's stock.
// db: the Prisma client, or a transaction.
export async function buildReport(storeIds, from, to, ownerId = null, db = prisma) {
  const byOwner = ownerId ? { ownerId } : {}
  const [beforeRows, rangeRows, entries] = await Promise.all([
    logSums(db, { storeId: { in: storeIds }, ...onHandBefore(from), ...byOwner }),
    logSums(db, { storeId: { in: storeIds }, entryDate: { gte: from, lte: to }, ...IN_PERIOD, ...byOwner }),
    db.stockEntry.findMany({
      where: { storeId: { in: storeIds }, ...byOwner },
      select: { storeId: true, productId: true, ownerId: true, forProjectId: true, rate: true },
    }),
  ])

  const beforeMap = foldLogs(beforeRows)
  const rangeMap = foldLogs(rangeRows)
  const rates = new Map(entries.map(e => [rowKey(e), e.rate]))

  const productIds = new Set()
  const ownerIds = new Set()
  const projectIds = new Set()
  const rows = []
  new Set([...Object.keys(beforeMap), ...Object.keys(rangeMap)]).forEach(key => {
    const [storeId, productId, rowOwnerId, forProjectId] = key.split(":")
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
    if (forProjectId) projectIds.add(forProjectId)
    rows.push({
      storeId, productId, ownerId: rowOwnerId, forProjectId: forProjectId || null,
      opening, added, deducted, adjusted, closing,
      rate, closingValue: rate == null ? null : closing * rate,
    })
  })

  const [products, stores, owners, projects] = await Promise.all([
    db.product.findMany({ where: { id: { in: [...productIds] } }, include: { unit: true } }),
    db.store.findMany({ where: { id: { in: storeIds } }, ...storeSelect }),
    db.stockOwner.findMany({ where: { id: { in: [...ownerIds] } }, ...ownerSelect }),
    db.project.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true, name: true } }),
  ])
  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s]))
  const ownerMap = Object.fromEntries(owners.map(o => [o.id, o]))
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

  return rows
    .map(row => ({
      ...row,
      productName: productMap[row.productId]?.name ?? "Unknown product",
      unit: productMap[row.productId]?.unit.name ?? "",
      storeName: storeMap[row.storeId] ? storeLabel(storeMap[row.storeId]) : "Unknown store",
      categoryName: storeMap[row.storeId]?.category.name ?? "",
      ownerName: ownerLabel(ownerMap[row.ownerId]),
      keptFor: row.forProjectId ? projectMap[row.forProjectId] ?? "A project" : null,
    }))
    .sort((a, b) =>
      a.storeName.localeCompare(b.storeName) ||
      a.productName.localeCompare(b.productName) ||
      a.ownerName.localeCompare(b.ownerName) ||
      (a.keptFor ?? "").localeCompare(b.keptFor ?? ""))
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
      approval: approvalSelect,
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
    receivedBy: l.receivedBy,
    issuedBy: l.handedOverBy ?? l.user?.username ?? null,
    approvedBy: approvedBy(l),
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
      approval: approvalSelect,
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
    issuedBy: l.handedOverBy ?? l.user?.username ?? null,
    approvedBy: approvedBy(l),
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
  returns: { type: "RETURN" },
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

// How much a group of logs (one type) changed its store's balance
function groupChange(row) {
  const qty = row._sum.quantity ?? 0
  if (row.type === "IN" || row.type === "TRANSFER_IN" || row.type === "RETURN") return qty
  if (row.type === "TRANSFER_OUT") return -qty
  return row._sum.adjustment ?? 0
}

// Stock balances: the whole inventory per product and owner for a period, across every store plus
// opening balances not yet issued to a store. Moving stock between stores (opening stock into a
// store included) doesn't change the total, so
//   closing = opening + received − used − issued + returned + adjusted
// and closing splits into what is in stores and what is not yet in a store.
export async function buildStockBalances({ from, to, ownerId = null, db = prisma }) {
  const byOwner = ownerId ? { ownerId } : {}
  const by = ["storeId", "productId", "ownerId", "forProjectId", "type", "projectId", "recipientId"]
  const [beforeRows, rangeRows, systemStores, entries] = await Promise.all([
    db.stockLog.groupBy({ by, where: { ...LIVE, ...byOwner, ...onHandBefore(from) }, _sum: { quantity: true, adjustment: true } }),
    db.stockLog.groupBy({ by, where: { ...LIVE, ...byOwner, ...IN_PERIOD, entryDate: { gte: from, lte: to } }, _sum: { quantity: true, adjustment: true } }),
    db.store.findMany({ where: { category: { isSystem: true } }, select: { id: true } }),
    db.stockEntry.findMany({ where: byOwner, select: { storeId: true, productId: true, ownerId: true, forProjectId: true, rate: true } }),
  ])
  const system = new Set(systemStores.map(s => s.id))
  const rates = new Map(entries.map(e => [rowKey(e), e.rate]))

  const items = new Map() // productId:ownerId → totals
  const closingByRow = new Map() // rowKey → closing
  const itemOf = r => {
    const key = `${r.productId}:${r.ownerId}`
    if (!items.has(key)) items.set(key, { productId: r.productId, ownerId: r.ownerId, opening: 0, received: 0, used: 0, issued: 0, returned: 0, adjusted: 0 })
    return items.get(key)
  }
  const addClosing = (r, change) => {
    const key = rowKey(r)
    closingByRow.set(key, (closingByRow.get(key) ?? 0) + change)
  }

  beforeRows.forEach(r => {
    const change = groupChange(r)
    itemOf(r).opening += change
    addClosing(r, change)
  })
  rangeRows.forEach(r => {
    const change = groupChange(r)
    const item = itemOf(r)
    addClosing(r, change)
    if (r.type === "IN") item.received += change
    else if (r.type === "RETURN") item.returned += change
    else if (r.type === "TRANSFER_OUT" && r.projectId) item.used -= change
    else if (r.type === "TRANSFER_OUT" && r.recipientId) item.issued -= change
    else if (ADJUST_TYPES.includes(r.type)) item.adjusted += change
    // Transfers between stores cancel out across the inventory
  })

  for (const [key, closing] of closingByRow) {
    const [storeId, productId, rowOwnerId] = key.split(":")
    const item = items.get(`${productId}:${rowOwnerId}`)
    const clean = Math.abs(closing) < 1e-9 ? 0 : closing
    item.closing = (item.closing ?? 0) + clean
    if (system.has(storeId)) item.notInStore = (item.notInStore ?? 0) + clean
    else item.inStores = (item.inStores ?? 0) + clean
    item.value = (item.value ?? 0) + clean * (rates.get(key) ?? 0)
  }

  const list = [...items.values()].filter(i => i.opening || i.received || i.used || i.issued || i.returned || i.adjusted || i.closing)
  const [products, owners] = await Promise.all([
    db.product.findMany({ where: { id: { in: [...new Set(list.map(i => i.productId))] } }, include: { unit: true } }),
    db.stockOwner.findMany({ where: { id: { in: [...new Set(list.map(i => i.ownerId))] } }, ...ownerSelect }),
  ])
  const productMap = new Map(products.map(p => [p.id, p]))
  const ownerMap = new Map(owners.map(o => [o.id, o]))
  const round = n => (Math.abs(n ?? 0) < 1e-9 ? 0 : Number((n ?? 0).toPrecision(12)))

  return list
    .map(i => ({
      productId: i.productId,
      product: productMap.get(i.productId)?.name ?? "Unknown product",
      unit: productMap.get(i.productId)?.unit.name ?? "",
      owner: ownerLabel(ownerMap.get(i.ownerId)),
      opening: round(i.opening),
      received: round(i.received),
      used: round(i.used),
      issued: round(i.issued),
      returned: round(i.returned),
      adjusted: round(i.adjusted),
      closing: round(i.closing),
      inStores: round(i.inStores),
      notInStore: round(i.notInStore),
      value: i.value ?? 0,
    }))
    .sort((a, b) => a.product.localeCompare(b.product) || a.owner.localeCompare(b.owner))
}

// Project materials: for one project, per store, product and owner over a period
//   received  stock received for the project (kept for it)
//   issued    stock issued to the project (from its own stock or general stock)
//   returned  stock that came back from the project's site
//   used      issued − returned
//   released  stock kept for the project that was released to general stock
//   held      stock kept for the project on the shelf at the start and at the end
// e.g. received 500, issued 450, returned 30 → used 420, held 80.
export async function buildProjectMaterials({ projectId, storeIds = null, from, to, ownerId = null, db = prisma }) {
  const scope = { ...LIVE, ...(storeIds && { storeId: { in: storeIds } }), ...(ownerId && { ownerId }) }
  const project = { OR: [{ projectId }, { forProjectId: projectId }] }
  const by = ["storeId", "productId", "ownerId", "forProjectId", "projectId", "type"]
  const [beforeRows, rangeRows] = await Promise.all([
    db.stockLog.groupBy({ by, where: { ...scope, ...project, entryDate: { lt: from } }, _sum: { quantity: true, adjustment: true } }),
    db.stockLog.groupBy({ by, where: { ...scope, ...project, entryDate: { gte: from, lte: to } }, _sum: { quantity: true, adjustment: true } }),
  ])

  const lines = new Map()
  const lineOf = r => {
    const key = `${r.storeId}:${r.productId}:${r.ownerId}`
    if (!lines.has(key)) {
      lines.set(key, { storeId: r.storeId, productId: r.productId, ownerId: r.ownerId, heldStart: 0, received: 0, issued: 0, returned: 0, released: 0, heldEnd: 0 })
    }
    return lines.get(key)
  }
  // Only rows kept for the project count towards what it holds
  beforeRows.forEach(r => {
    if (r.forProjectId !== projectId) return
    const line = lineOf(r)
    line.heldStart += groupChange(r)
    line.heldEnd += groupChange(r)
  })
  rangeRows.forEach(r => {
    const line = lineOf(r)
    const qty = r._sum.quantity ?? 0
    if (r.forProjectId === projectId) line.heldEnd += groupChange(r)
    if (r.type === "IN" && r.forProjectId === projectId) line.received += qty
    else if (r.type === "TRANSFER_OUT" && r.projectId === projectId) line.issued += qty
    else if (r.type === "RETURN" && r.projectId === projectId) line.returned += qty
    else if (r.type === "RELEASE" && r.forProjectId === projectId) line.released -= r._sum.adjustment ?? 0
  })

  const round = n => (Math.abs(n) < 1e-9 ? 0 : Number(n.toPrecision(12)))
  const list = [...lines.values()]
    .map(l => ({ ...l, used: round(l.issued - l.returned) }))
    .filter(l => l.heldStart || l.received || l.issued || l.returned || l.released || l.heldEnd)
  const [products, stores, owners] = await Promise.all([
    db.product.findMany({ where: { id: { in: [...new Set(list.map(l => l.productId))] } }, include: { unit: true } }),
    db.store.findMany({ where: { id: { in: [...new Set(list.map(l => l.storeId))] } }, ...storeSelect }),
    db.stockOwner.findMany({ where: { id: { in: [...new Set(list.map(l => l.ownerId))] } }, ...ownerSelect }),
  ])
  const productMap = new Map(products.map(p => [p.id, p]))
  const storeMap = new Map(stores.map(s => [s.id, s]))
  const ownerMap = new Map(owners.map(o => [o.id, o]))

  return list
    .map(l => ({
      store: storeMap.get(l.storeId) ? storeLabel(storeMap.get(l.storeId)) : "Unknown store",
      product: productMap.get(l.productId)?.name ?? "Unknown product",
      unit: productMap.get(l.productId)?.unit.name ?? "",
      owner: ownerLabel(ownerMap.get(l.ownerId)),
      heldStart: round(l.heldStart),
      received: round(l.received),
      issued: round(l.issued),
      returned: round(l.returned),
      used: l.used,
      released: round(l.released),
      heldEnd: round(l.heldEnd),
    }))
    .sort((a, b) => a.store.localeCompare(b.store) || a.product.localeCompare(b.product) || a.owner.localeCompare(b.owner))
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
