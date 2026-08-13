import prisma from "@/lib/prisma"

async function balanceLogsFor(storeIds, before) {
  return prisma.stockLog.groupBy({
    by: ["storeId", "productId", "type"],
    where: { storeId: { in: storeIds }, createdAt: { lt: before } },
    _sum: { quantity: true },
  })
}

async function rangeLogsFor(storeIds, from, to) {
  return prisma.stockLog.groupBy({
    by: ["storeId", "productId", "type"],
    where: { storeId: { in: storeIds }, createdAt: { gte: from, lte: to } },
    _sum: { quantity: true },
  })
}

function foldLogs(rows) {
  // rows keyed by `${storeId}:${productId}` -> { IN, TRANSFER_IN, TRANSFER_OUT }
  const map = {}
  rows.forEach(r => {
    const key = `${r.storeId}:${r.productId}`
    if (!map[key]) map[key] = { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }
    map[key][r.type] = r._sum.quantity ?? 0
  })
  return map
}

export async function buildReport(storeIds, from, to) {
  const [beforeRows, rangeRows] = await Promise.all([
    balanceLogsFor(storeIds, from),
    rangeLogsFor(storeIds, from, to),
  ])

  const beforeMap = foldLogs(beforeRows)
  const rangeMap = foldLogs(rangeRows)

  // Every store:product pair that appears in either window
  const keys = new Set([...Object.keys(beforeMap), ...Object.keys(rangeMap)])
  const productIds = new Set()
  const rows = []

  keys.forEach(key => {
    const [storeId, productId] = key.split(":")
    productIds.add(productId)

    const b = beforeMap[key] ?? { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }
    const r = rangeMap[key] ?? { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }

    const opening = (b.IN + b.TRANSFER_IN) - b.TRANSFER_OUT
    const added = r.IN + r.TRANSFER_IN
    const deducted = r.TRANSFER_OUT
    const closing = opening + added - deducted

    // Skip rows with zero activity everywhere — nothing to report
    if (opening === 0 && added === 0 && deducted === 0 && closing === 0) return

    rows.push({ storeId, productId, opening, added, deducted, closing })
  })

  const [products, stores] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      include: { unit: true },
    }),
    prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
  ])

  const productMap = Object.fromEntries(products.map(p => [p.id, p]))
  const storeMap = Object.fromEntries(stores.map(s => [s.id, s]))

  return rows
    .map(row => ({
      ...row,
      productName: productMap[row.productId]?.name ?? "Unknown product",
      unit: productMap[row.productId]?.unit.name ?? "",
      storeName: storeMap[row.storeId]?.name ?? "Unknown store",
      categoryName: storeMap[row.storeId]?.category.name ?? "",
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName) || a.productName.localeCompare(b.productName))
}

export async function buildRecipientReport(recipientId, from, to) {
  const where = {
    recipientId: recipientId || { not: null },
    createdAt: { gte: from, lte: to },
  }

  const logs = await prisma.stockLog.findMany({
    where,
    include: {
      store: { select: { id: true, name: true, category: { select: { name: true } } } },
      product: { include: { unit: true } },
      recipient: { select: { id: true, name: true, company: true } },
      user: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return logs.map(l => ({
    date: l.createdAt,
    store: l.store.name,
    category: l.store.category.name,
    product: l.product.name,
    unit: l.product.unit.name,
    quantity: l.quantity,
    rate: l.rate,
    value: l.quantity * l.rate,
    recipientName: l.recipient?.name ?? "Unknown",
    recipientCompany: l.recipient?.company ?? "",
    issuedBy: l.user?.username ?? null,
  }))
}