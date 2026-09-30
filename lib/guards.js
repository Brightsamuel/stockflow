// How many history records point at a user, store or product. Deletes are refused while any
// do, so the history keeps its author, store and product. `db` is the Prisma client or a
// transaction.

export async function userActivity(db, userId) {
  const [logs, transfers] = await Promise.all([
    db.stockLog.count({ where: { userId } }),
    db.transfer.count({ where: { userId } }),
  ])
  return logs + transfers
}

export async function storeHistory(db, storeId) {
  const [logs, transfers] = await Promise.all([
    db.stockLog.count({ where: { storeId } }),
    db.transfer.count({ where: { OR: [{ sourceStoreId: storeId }, { targetStoreId: storeId }] } }),
  ])
  return logs + transfers
}

// Everything except an unissued opening balance (which is removed together with the product)
export async function productHistory(db, productId) {
  const [logs, transfers] = await Promise.all([
    db.stockLog.count({ where: { productId, store: { category: { isSystem: false } } } }),
    db.transfer.count({ where: { productId } }),
  ])
  return logs + transfers
}
