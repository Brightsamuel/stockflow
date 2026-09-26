// Moves stock out of a store inside the caller's transaction, either to another store
// (a transfer) or out of the inventory to a project or external party (used / issued).
// Lines point at the source store's rows by entry id, so each owner's stock moves on its own.

function moveError(message, status = 400) {
  const err = new Error(message)
  err.status = status
  return err
}

export async function applyStockMove(tx, {
  sourceStoreId,
  targetStoreId = null,
  projectId = null,
  recipientId = null,
  items,
  refNo = null,
  entryDate,
  outNote,
  inNote,
  sourceUserId = null,
  targetUserId = null,
  transferUserId = null,
}) {
  const sources = await tx.stockEntry.findMany({
    where: { id: { in: [...new Set(items.map(item => item.entryId))] } },
    include: { product: { select: { name: true } } },
  })
  const byId = new Map(sources.map(e => [e.id, e]))

  // Every line must point at a live row in the source store, and each row must cover all its lines
  const wanted = new Map()
  items.forEach((item, i) => {
    const entry = byId.get(item.entryId)
    if (!entry || entry.storeId !== sourceStoreId || entry.isDeleted)
      throw moveError(`Line ${i + 1}: item not found in this store`, 404)
    wanted.set(entry.id, (wanted.get(entry.id) ?? 0) + item.quantity)
  })
  for (const [id, qty] of wanted) {
    const entry = byId.get(id)
    if (qty - entry.quantity > 1e-9)
      throw moveError(`Not enough ${entry.product.name}. Available: ${entry.quantity}`, 422)
  }

  // The date can't be earlier than when the item first arrived in this store
  for (const productId of new Set(sources.map(e => e.productId))) {
    const first = await tx.stockLog.findFirst({
      where: { productId, storeId: sourceStoreId, type: "IN" },
      orderBy: { entryDate: "asc" },
      select: { entryDate: true, product: { select: { name: true } } },
    })
    if (first && entryDate < first.entryDate)
      throw moveError(`${first.product.name} wasn't recorded in this store until ${first.entryDate.toISOString().slice(0, 10)}. The date can't be earlier than that.`)
  }

  for (const [id, qty] of wanted) {
    await tx.stockEntry.update({ where: { id }, data: { quantity: { decrement: qty } } })
  }

  if (targetStoreId) {
    const targets = await tx.stockEntry.findMany({
      where: { storeId: targetStoreId, productId: { in: sources.map(e => e.productId) } },
    })
    const targetMap = new Map(targets.map(t => [`${t.productId}:${t.ownerId}`, t]))

    for (const [id, qty] of wanted) {
      const source = byId.get(id)
      const key = `${source.productId}:${source.ownerId}`
      const target = targetMap.get(key)
      let entry
      if (target && !target.isDeleted) {
        entry = await tx.stockEntry.update({ where: { id: target.id }, data: { quantity: { increment: qty } } })
      } else {
        if (target) await tx.stockEntry.delete({ where: { id: target.id } })
        // A store receiving the item for the first time takes the source's rate
        entry = await tx.stockEntry.create({
          data: { productId: source.productId, storeId: targetStoreId, ownerId: source.ownerId, rate: source.rate, quantity: qty },
        })
      }
      targetMap.set(key, entry)
    }
  }

  const lines = items.map(item => ({ item, source: byId.get(item.entryId) }))

  await tx.transfer.createMany({
    data: lines.map(({ item, source }) => ({
      sourceStoreId, targetStoreId, projectId, recipientId,
      productId: source.productId, ownerId: source.ownerId,
      quantity: item.quantity, userId: transferUserId, refNo, entryDate,
    })),
  })

  await tx.stockLog.createMany({
    data: lines.flatMap(({ item, source }) => {
      const shared = { productId: source.productId, ownerId: source.ownerId, quantity: item.quantity, rate: source.rate, refNo, entryDate }
      const out = { ...shared, storeId: sourceStoreId, type: "TRANSFER_OUT", note: outNote, userId: sourceUserId, recipientId, projectId }
      return targetStoreId
        ? [out, { ...shared, storeId: targetStoreId, type: "TRANSFER_IN", note: inNote, userId: targetUserId }]
        : [out]
    }),
  })

  return items.length
}
