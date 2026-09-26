import prisma from "@/lib/prisma"
import { ownerLabel } from "@/lib/owners"

const ownerSelect = { select: { id: true, name: true } }

async function balanceLogsFor(storeIds, before, ownerId) {
  return prisma.stockLog.groupBy({
    by: ["storeId", "productId", "ownerId", "type"],
    where: { storeId: { in: storeIds }, entryDate: { lt: before }, ...(ownerId && { ownerId }) },
    _sum: { quantity: true },
  })
}

async function rangeLogsFor(storeIds, from, to, ownerId) {
  return prisma.stockLog.groupBy({
    by: ["storeId", "productId", "ownerId", "type"],
    where: { storeId: { in: storeIds }, entryDate: { gte: from, lte: to }, ...(ownerId && { ownerId }) },
    _sum: { quantity: true },
  })
}

function foldLogs(rows) {
  // rows keyed by `${storeId}:${productId}:${ownerId}` -> { IN, TRANSFER_IN, TRANSFER_OUT }
  const map = {}
  rows.forEach(r => {
    const key = `${r.storeId}:${r.productId}:${r.ownerId}`
    if (!map[key]) map[key] = { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }
    map[key][r.type] = r._sum.quantity ?? 0
  })
  return map
}

// ownerId (optional) limits the report to one owner's stock
export async function buildReport(storeIds, from, to, ownerId = null) {
  const [beforeRows, rangeRows] = await Promise.all([
    balanceLogsFor(storeIds, from, ownerId),
    rangeLogsFor(storeIds, from, to, ownerId),
  ])

  const beforeMap = foldLogs(beforeRows)
  const rangeMap = foldLogs(rangeRows)

  // Every store:product:owner combination that appears in either window
  const keys = new Set([...Object.keys(beforeMap), ...Object.keys(rangeMap)])
  const productIds = new Set()
  const ownerIds = new Set()
  const rows = []

  keys.forEach(key => {
    const [storeId, productId, rowOwnerId] = key.split(":")
    productIds.add(productId)
    ownerIds.add(rowOwnerId)

    const b = beforeMap[key] ?? { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }
    const r = rangeMap[key] ?? { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }

    const opening = (b.IN + b.TRANSFER_IN) - b.TRANSFER_OUT
    const added = r.IN + r.TRANSFER_IN
    const deducted = r.TRANSFER_OUT
    const closing = opening + added - deducted

    // Skip rows with zero activity everywhere — nothing to report
    if (opening === 0 && added === 0 && deducted === 0 && closing === 0) return

    rows.push({ storeId, productId, ownerId: rowOwnerId, opening, added, deducted, closing })
  })

  const [products, stores, owners] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      include: { unit: true },
    }),
    prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
    prisma.stockOwner.findMany({ where: { id: { in: [...ownerIds] } }, ...ownerSelect }),
  ])

  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s]))
  const ownerMap = Object.fromEntries(owners.map(o => [o.id, o]))

  return rows
    .map(row => ({
      ...row,
      productName: productMap[row.productId]?.name ?? "Unknown product",
      unit: productMap[row.productId]?.unit.name ?? "",
      storeName: storeMap[row.storeId]?.name ?? "Unknown store",
      categoryName: storeMap[row.storeId]?.category.name ?? "",
      ownerName: ownerLabel(ownerMap[row.ownerId]),
    }))
    .sort((a, b) =>
      a.storeName.localeCompare(b.storeName) ||
      a.productName.localeCompare(b.productName) ||
      a.ownerName.localeCompare(b.ownerName))
}

export async function buildRecipientReport(recipientId, from, to, ownerId = null) {
  const where = {
    recipientId: recipientId || { not: null },
    entryDate: { gte: from, lte: to },
    ...(ownerId && { ownerId }),
  }

  const logs = await prisma.stockLog.findMany({
    where,
    include: {
      store: { select: { id: true, name: true, category: { select: { name: true } } } },
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
    store: l.store.name,
    category: l.store.category.name,
    product: l.product.name,
    unit: l.product.unit.name,
    owner: ownerLabel(l.owner),
    quantity: l.quantity,
    rate: l.rate,
    value: l.quantity * l.rate,
    recipientName: l.recipient?.name ?? "Unknown",
    recipientCompany: l.recipient?.company ?? "",
    issuedBy: l.user?.username ?? null,
  }))
}

// Field records: stock issued to projects (used in the field)
export async function buildProjectReport(projectId, from, to, ownerId = null) {
  const logs = await prisma.stockLog.findMany({
    where: {
      type: "TRANSFER_OUT",
      projectId: projectId || { not: null },
      entryDate: { gte: from, lte: to },
      ...(ownerId && { ownerId }),
    },
    include: {
      store: { select: { name: true, category: { select: { name: true } } } },
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
    store: l.store.name,
    category: l.store.category.name,
    product: l.product.name,
    unit: l.product.unit.name,
    owner: ownerLabel(l.owner),
    quantity: l.quantity,
    rate: l.rate,
    value: l.quantity * l.rate,
    issuedBy: l.user?.username ?? null,
  }))
}

export async function buildRefReport(refNo) {
  const logs = await prisma.stockLog.findMany({
    where: { refNo },
    include: {
      store: { select: { id: true, name: true, category: { select: { name: true } } } },
      product: { include: { unit: true } },
      user: { select: { username: true } },
      owner: ownerSelect,
    },
    orderBy: { entryDate: "asc" },
  })

  return logs.map(l => ({
    date: l.entryDate,
    store: l.store.name,
    category: l.store.category.name,
    product: l.product.name,
    unit: l.product.unit.name,
    owner: ownerLabel(l.owner),
    quantity: l.quantity,
    rate: l.rate,
    value: l.quantity * l.rate,
    type: l.type,
    note: l.note,
    addedBy: l.user?.username ?? null,
  }))
}
