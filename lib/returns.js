import { httpError } from "@/lib/http"
import { LIVE } from "@/lib/movements"
import { ownerLabel } from "@/lib/owners"

// Returns from a project: stock issued to a project's site that comes back into the store it left.
// Nothing more can come back than was issued to that project from that store, less what has
// already been returned. It goes back onto the project's row (kept for the project) or general stock.

// What the project can still send back to the store, per product and owner, with the rate of the
// latest issue (the rate a returned item is valued at)
export async function returnable(db, { storeId, projectId }) {
  const [issued, returned] = await Promise.all([
    db.stockLog.findMany({
      where: { ...LIVE, storeId, projectId, type: "TRANSFER_OUT" },
      select: { productId: true, ownerId: true, quantity: true, rate: true, product: { include: { unit: true } }, owner: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    db.stockLog.groupBy({ by: ["productId", "ownerId"], where: { ...LIVE, storeId, projectId, type: "RETURN" }, _sum: { quantity: true } }),
  ])
  const back = new Map(returned.map(r => [`${r.productId}:${r.ownerId}`, r._sum.quantity ?? 0]))
  const lines = new Map()
  for (const log of issued) {
    const key = `${log.productId}:${log.ownerId}`
    if (!lines.has(key)) {
      lines.set(key, {
        key, productId: log.productId, product: log.product.name, unit: log.product.unit.name,
        ownerId: log.ownerId, owner: ownerLabel(log.owner), rate: log.rate, issued: 0, returned: back.get(key) ?? 0,
      })
    }
    lines.get(key).issued += log.quantity
  }
  return [...lines.values()]
    .map(l => ({ ...l, returnable: Math.max(Number((l.issued - l.returned).toPrecision(12)), 0) }))
    .sort((a, b) => a.product.localeCompare(b.product) || a.owner.localeCompare(b.owner))
}

// Records a return inside the caller's transaction. items: [{ productId, ownerId, quantity }];
// putBack: "project" (kept for it) or "general".
export async function applyReturn(tx, {
  storeId, projectId, projectName, items, putBack, refNo = null, entryDate, userId = null, returnedBy = null, receivedBy = null,
}) {
  const available = new Map((await returnable(tx, { storeId, projectId })).map(a => [a.key, a]))
  const wanted = new Map()
  items.forEach((item, i) => {
    const key = `${item.productId}:${item.ownerId}`
    if (!available.has(key)) throw httpError(`Line ${i + 1}: that item was never issued to ${projectName} from this store`)
    wanted.set(key, (wanted.get(key) ?? 0) + item.quantity)
  })
  for (const [key, qty] of wanted) {
    const a = available.get(key)
    if (qty - a.returnable > 1e-9) {
      throw httpError(
        `Only ${a.returnable} ${a.unit} of ${a.product} can come back: ${a.issued} were issued to ${projectName} from this store and ${a.returned} have been returned already.`,
        422,
      )
    }
  }

  const forProjectId = putBack === "project" ? projectId : null
  for (const [key, qty] of wanted) {
    const a = available.get(key)
    const row = await tx.stockEntry.findFirst({ where: { storeId, productId: a.productId, ownerId: a.ownerId, forProjectId } })
    if (row && !row.isDeleted) {
      await tx.stockEntry.update({ where: { id: row.id }, data: { quantity: { increment: qty } } })
    } else {
      // As with a stock in, a row sitting in Removed items starts afresh
      if (row) await tx.stockEntry.delete({ where: { id: row.id } })
      await tx.stockEntry.create({ data: { storeId, productId: a.productId, ownerId: a.ownerId, forProjectId, rate: a.rate, quantity: qty } })
    }
  }

  await tx.stockLog.createMany({
    data: items.map(item => ({
      storeId,
      productId: item.productId,
      ownerId: item.ownerId,
      type: "RETURN",
      quantity: item.quantity,
      rate: available.get(`${item.productId}:${item.ownerId}`).rate,
      projectId,
      forProjectId,
      refNo,
      entryDate,
      userId,
      handedOverBy: returnedBy,
      receivedBy,
      note: `Returned from project ${projectName}${forProjectId ? ", kept for the project" : ", back to general stock"}`,
    })),
  })
  return items.length
}
