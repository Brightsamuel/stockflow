// Catches a stock in or stock movement that repeats one saved moments ago: the same store,
// destination and lines. That is nearly always a second click or a retry after a slow response
// (e.g. an opening balance issued twice), so the forms ask before saving it again.
// `db` is the Prisma client or a transaction.

const WINDOW_MS = 3 * 60 * 1000

const lineKey = l => `${l.productId}|${l.ownerId}|${l.quantity}${l.rate === undefined ? "" : `|${l.rate}`}`

// The newest save (rows sharing one createdAt) whose lines are exactly `wanted`
function latestMatching(rows, wanted) {
  const target = wanted.map(lineKey).sort().join(",")
  const saves = new Map()
  for (const row of rows) {
    const at = row.createdAt.getTime()
    if (!saves.has(at)) saves.set(at, [])
    saves.get(at).push(row)
  }
  const match = [...saves.entries()]
    .sort((a, b) => b[0] - a[0])
    .find(([, lines]) => lines.map(lineKey).sort().join(",") === target)
  return match ? new Date(match[0]) : null
}

function since() {
  return new Date(Date.now() - WINDOW_MS)
}

export function savedAgo(date) {
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`
  const minutes = Math.round(seconds / 60)
  return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
}

// items: [{ productId, rate, quantity }] received under one ref no. and owner
export async function recentStockIn(db, { storeId, ownerId, forProjectId = null, refNo, items }) {
  const rows = await db.stockLog.findMany({
    where: { storeId, ownerId, forProjectId, refNo, type: "IN", deletionId: null, createdAt: { gte: since() } },
    select: { productId: true, ownerId: true, quantity: true, rate: true, createdAt: true },
  })
  return latestMatching(rows, items.map(i => ({ productId: i.productId, ownerId, quantity: i.quantity, rate: i.rate })))
}

// lines: [{ productId, ownerId, quantity }] returned from one project into one store
export async function recentReturn(db, { storeId, projectId, refNo, lines }) {
  const rows = await db.stockLog.findMany({
    where: { storeId, projectId, refNo, type: "RETURN", deletionId: null, createdAt: { gte: since() } },
    select: { productId: true, ownerId: true, quantity: true, createdAt: true },
  })
  return latestMatching(rows, lines.map(l => ({ productId: l.productId, ownerId: l.ownerId, quantity: l.quantity })))
}

// lines: [{ productId, ownerId, quantity }] moved from one store to one destination
export async function recentStockMove(db, { sourceStoreId, targetStoreId, projectId, recipientId, lines }) {
  const rows = await db.transfer.findMany({
    where: { sourceStoreId, targetStoreId, projectId, recipientId, deletionId: null, createdAt: { gte: since() } },
    select: { productId: true, ownerId: true, quantity: true, createdAt: true },
  })
  return latestMatching(rows, lines)
}
