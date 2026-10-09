// Moves stock out of a store inside the caller's transaction, either to another store
// (a transfer) or out of the inventory to a project or external party (used / issued).
// Lines point at the source store's rows by entry id, so each owner's stock moves on its own.
// Stock kept for a project (a row with forProjectId) can only be issued to that project, or moved
// to another store where it stays kept for it; it never goes to an external party or another project.

import { TIME_ZONE, fmtDate } from "@/lib/format"
import { NO_OWNER } from "@/lib/owners"

// How stock comes onto a store row: received, transferred in or issued in as opening stock,
// returned from a project, or released from a project's row to general stock
const ARRIVALS = { OR: [{ type: { in: ["IN", "TRANSFER_IN", "RETURN"] } }, { type: "RELEASE", adjustment: { gt: 0 } }] }

// The calendar day in Kampala, so a date picked on a form (midnight) and a time something was
// saved (e.g. a release) compare by day
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
const dayOf = date => dayFormat.format(date)

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
  takenBy = null,
  items,
  refNo = null,
  entryDate,
  outNote,
  inNote,
  sourceUserId = null,
  targetUserId = null,
  transferUserId = null,
  handedOverBy = null, // typed name: issued by / dispatched by
  receivedBy = null, // typed name: received by (external party or destination store)
  openingStock = false, // an opening balance going to a store: it arrives as opening stock
  // Opening stock has no owner; when it is issued to a store, the owner it belongs to is chosen
  // then and its rows there are that owner's. Only allowed with openingStock and a target store.
  targetOwnerId = null,
}) {
  if (targetOwnerId && !(openingStock && targetStoreId))
    throw moveError("A stock owner can only be chosen when issuing opening stock to a store")
  const sources = await tx.stockEntry.findMany({
    where: { id: { in: [...new Set(items.map(item => item.entryId))] } },
    include: { product: { select: { name: true } }, owner: { select: { name: true } }, forProject: { select: { name: true } } },
  })
  const byId = new Map(sources.map(e => [e.id, e]))

  // Every line must point at a live row in the source store, and each row must cover all its lines
  const wanted = new Map()
  items.forEach((item, i) => {
    const entry = byId.get(item.entryId)
    if (!entry || entry.storeId !== sourceStoreId || entry.isDeleted)
      throw moveError(`Line ${i + 1}: item not found in this store`, 404)
    if (entry.forProjectId && projectId && entry.forProjectId !== projectId)
      throw moveError(`Line ${i + 1}: this ${entry.product.name} is kept for project ${entry.forProject.name}, so it can only be issued to that project`)
    if (entry.forProjectId && recipientId)
      throw moveError(`Line ${i + 1}: this ${entry.product.name} is kept for project ${entry.forProject.name}. Release it to general stock before issuing it to an external party.`)
    wanted.set(entry.id, (wanted.get(entry.id) ?? 0) + item.quantity)
  })
  for (const [id, qty] of wanted) {
    const entry = byId.get(id)
    if (qty - entry.quantity > 1e-9)
      throw moveError(`Not enough ${entry.product.name}. Available: ${entry.quantity}`, 422)
  }

  // Stock can't leave before it arrived: the date can't be earlier than the day stock first came
  // onto the row being moved, however it came (see ARRIVALS). Each row is its own stock, so a
  // later delivery onto another row of the same item (another owner, or kept for a project)
  // doesn't hold this one back.
  for (const source of sources) {
    const first = await tx.stockLog.findFirst({
      where: {
        storeId: source.storeId, productId: source.productId, ownerId: source.ownerId, forProjectId: source.forProjectId,
        deletionId: null, ...ARRIVALS,
      },
      orderBy: { entryDate: "asc" },
      select: { entryDate: true },
    })
    if (first && dayOf(entryDate) < dayOf(first.entryDate)) {
      const owner = source.ownerId === NO_OWNER ? "" : ` (${source.owner.name})`
      const kept = source.forProject ? `, kept for ${source.forProject.name},` : ""
      throw moveError(`${source.product.name}${owner}${kept} only arrived in this store on ${fmtDate(first.entryDate)}, so it can't go out on an earlier date.`)
    }
  }

  for (const [id, qty] of wanted) {
    await tx.stockEntry.update({ where: { id }, data: { quantity: { decrement: qty } } })
  }

  // Whose stock it is once it arrives: the source's owner, or the one chosen for opening stock
  const ownerAtTarget = source => targetOwnerId ?? source.ownerId

  if (targetStoreId) {
    const targets = await tx.stockEntry.findMany({
      where: { storeId: targetStoreId, productId: { in: sources.map(e => e.productId) } },
    })
    const rowKey = r => `${r.productId}:${r.ownerId}:${r.forProjectId ?? ""}`
    const targetMap = new Map(targets.map(t => [rowKey(t), t]))

    for (const [id, qty] of wanted) {
      const source = byId.get(id)
      const ownerId = ownerAtTarget(source)
      const key = rowKey({ ...source, ownerId })
      const target = targetMap.get(key)
      let entry
      if (target && !target.isDeleted) {
        entry = await tx.stockEntry.update({ where: { id: target.id }, data: { quantity: { increment: qty } } })
      } else {
        if (target) await tx.stockEntry.delete({ where: { id: target.id } })
        // A store receiving the item for the first time takes the source's rate
        entry = await tx.stockEntry.create({
          data: { productId: source.productId, storeId: targetStoreId, ownerId, forProjectId: source.forProjectId, rate: source.rate, quantity: qty },
        })
      }
      targetMap.set(key, entry)
    }
  }

  const lines = items.map(item => ({ item, source: byId.get(item.entryId) }))

  // Transfer rows carry the owner of the stock that left (as the TRANSFER_OUT lines do)
  await tx.transfer.createMany({
    data: lines.map(({ item, source }) => ({
      sourceStoreId, targetStoreId, projectId, recipientId, takenBy,
      productId: source.productId, ownerId: source.ownerId,
      quantity: item.quantity, userId: transferUserId, refNo, entryDate,
    })),
  })

  await tx.stockLog.createMany({
    data: lines.flatMap(({ item, source }) => {
      const shared = {
        productId: source.productId, ownerId: source.ownerId, quantity: item.quantity, rate: source.rate, refNo, entryDate,
        handedOverBy, receivedBy, openingStock: Boolean(openingStock && targetStoreId), forProjectId: source.forProjectId,
      }
      const out = { ...shared, storeId: sourceStoreId, type: "TRANSFER_OUT", note: outNote, userId: sourceUserId, recipientId, projectId, takenBy }
      return targetStoreId
        ? [out, { ...shared, ownerId: ownerAtTarget(source), storeId: targetStoreId, type: "TRANSFER_IN", note: inNote, userId: targetUserId }]
        : [out]
    }),
  })

  return items.length
}
