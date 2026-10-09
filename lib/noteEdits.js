import { httpError } from "@/lib/http"
import { fmtNum } from "@/lib/format"
import { findNote } from "@/lib/notes"
import {
  CHANGED, REASON_MAX, applyChanges, blockedMessage, describe, planChanges, removeEmptiedRows, settleRates,
} from "@/lib/deletions"

// Editing a Goods Received Note (Admins and Super admins): change a line's qty or rate, take a line
// off, or add one, e.g. 90 entered where 79 came in. The store's stock moves by the difference, and
// nothing may go below what is left. The lines it replaces are kept, marked with an EDIT record (a
// Deletion with action EDIT) holding the note as it was and what changed, and no longer count
// anywhere; the note shows the edit. New lines take the note's ref no., date, store, owner,
// project, names and time saved, so it stays one note. An edit isn't undone from Deleted: editing
// the note again changes it back. Everything runs inside the caller's transaction.
//
// changed: [{ logId, quantity, rate }]  removed: [logId]  added: [{ productId, quantity, rate, ownerId? }]

const isQty = n => Number.isFinite(n) && n > 0
const isRate = n => Number.isFinite(n) && n >= 0

export async function editReceipt(tx, { refNo = null, logId = null, documentId, changed = [], removed = [], added = [], reason, user, preview = false }) {
  const note = await findNote(tx, { refNo, logId }, documentId)
  if (!note) throw httpError("This note has changed or has been deleted. Reload the page and try again.", 409)
  const { document, logs } = note
  if (!document.editable) throw httpError("Only Goods Received Notes can be edited. Opening balances are changed from Products.")

  const byId = new Map(logs.map(l => [l.id, l]))
  const touched = new Set()
  const claim = (id, i, what) => {
    if (!byId.has(id)) throw httpError(`${what} ${i + 1}: that line isn't on this note. Reload the page and try again.`, 409)
    if (touched.has(id)) throw httpError(`${what} ${i + 1}: a line can only be changed once in an edit`)
    touched.add(id)
  }

  // Lines whose qty or rate really changes
  const edits = []
  for (const [i, line] of (Array.isArray(changed) ? changed : []).entries()) {
    claim(line.logId, i, "Line")
    const quantity = Number(line.quantity), rate = Number(line.rate)
    if (!isQty(quantity)) throw httpError(`${byId.get(line.logId).product.name}: enter a quantity above 0, or take the line off`)
    if (!isRate(rate)) throw httpError(`${byId.get(line.logId).product.name}: the rate must be 0 or more`)
    const old = byId.get(line.logId)
    if (quantity !== old.quantity || rate !== old.rate) edits.push({ old, quantity, rate })
  }
  const takenOff = (Array.isArray(removed) ? removed : []).map((id, i) => { claim(id, i, "Removed line"); return byId.get(id) })

  // New lines: product, owner (the note's when it has one), qty and rate
  const owners = [...new Set(logs.map(l => l.ownerId))]
  const addedLines = Array.isArray(added) ? added : []
  const [products, ownerRows] = await Promise.all([
    tx.product.findMany({ where: { id: { in: addedLines.map(a => a.productId).filter(Boolean) } }, include: { unit: true } }),
    tx.stockOwner.findMany({ where: { id: { in: [...owners, ...addedLines.map(a => a.ownerId).filter(Boolean)] } }, select: { id: true, name: true } }),
  ])
  const productById = new Map(products.map(p => [p.id, p]))
  const ownerById = new Map(ownerRows.map(o => [o.id, o]))
  const additions = addedLines.map((line, i) => {
    const product = productById.get(line.productId)
    if (!product) throw httpError(`New line ${i + 1}: choose a product`)
    const quantity = Number(line.quantity), rate = Number(line.rate)
    if (!isQty(quantity)) throw httpError(`${product.name}: enter a quantity above 0`)
    if (!isRate(rate)) throw httpError(`${product.name}: the rate must be 0 or more`)
    const ownerId = line.ownerId || (owners.length === 1 ? owners[0] : null)
    if (!ownerId || !ownerById.has(ownerId)) throw httpError(`${product.name}: choose whose stock it is`)
    return { product, owner: ownerById.get(ownerId), quantity, rate }
  })

  if (!edits.length && !takenOff.length && !additions.length) throw httpError("Nothing has changed")
  if (logs.length - takenOff.length + additions.length < 1)
    throw httpError("A note needs at least one line. To take them all off, delete the note instead.")

  // A new line copies the line it replaces, or for an added line the note's first line
  const template = logs[0]
  const newLine = (base, overrides) => ({
    storeId: base.storeId, productId: base.productId, ownerId: base.ownerId, forProjectId: base.forProjectId,
    type: "IN", refNo: base.refNo, entryDate: base.entryDate, createdAt: base.createdAt, note: base.note,
    userId: base.userId, handedOverBy: base.handedOverBy, receivedBy: base.receivedBy, ...overrides,
  })
  const created = [
    ...edits.map(({ old, quantity, rate }) => newLine(old, { quantity, rate })),
    ...additions.map(({ product, owner, quantity, rate }) => newLine(template, { productId: product.id, ownerId: owner.id, quantity, rate })),
  ]
  // The same lines as planChanges sees them: with the store, product and owner it names in messages
  const shown = [
    ...edits.map(({ old, quantity, rate }) => ({ ...old, id: undefined, quantity, rate })),
    ...additions.map(({ product, owner, quantity, rate }) => ({ ...template, id: undefined, productId: product.id, product, ownerId: owner.id, owner, quantity, rate })),
  ]

  const replaced = [...edits.map(e => e.old), ...takenOff]
  const plan = await planChanges(tx, [
    ...replaced.map(log => ({ log, direction: -1 })),
    ...shown.map(log => ({ log, direction: 1 })),
  ], "this edit")

  const unit = log => log.product.unit.name
  const changes = [
    ...edits.map(({ old, quantity, rate }) => [
      `${old.product.name}: `,
      quantity !== old.quantity ? `${fmtNum(old.quantity)} → ${fmtNum(quantity)} ${unit(old)}` : "",
      quantity !== old.quantity && rate !== old.rate ? ", " : "",
      rate !== old.rate ? `rate ${fmtNum(old.rate)} → ${fmtNum(rate)}` : "",
    ].join("")),
    ...takenOff.map(log => `${log.product.name}: ${fmtNum(log.quantity)} ${unit(log)} taken off`),
    ...additions.map(({ product, quantity }) => `${product.name}: ${fmtNum(quantity)} ${product.unit.name} added`),
  ]

  if (preview) return { ...describe(plan), edits: changes }
  if (plan.problems.length) throw httpError(blockedMessage("edited", plan), 409)

  const why = typeof reason === "string" ? reason.trim() : ""
  if (!why) throw httpError("Enter the reason for editing this note")
  if (why.length > REASON_MAX) throw httpError(`Keep the reason under ${REASON_MAX} characters`)

  const record = await tx.deletion.create({
    data: {
      action: "EDIT",
      kind: document.kind,
      refNo: document.refNo,
      title: document.title,
      summary: document.summary,
      itemCount: replaced.length,
      value: document.total,
      entryDate: new Date(Math.min(...logs.map(l => l.entryDate.getTime()))),
      reason: why,
      document: { ...document, edit: { changes } },
      userId: user.id,
    },
  })
  if (replaced.length) {
    const marked = await tx.stockLog.updateMany({ where: { id: { in: replaced.map(l => l.id) }, deletionId: null }, data: { deletionId: record.id } })
    if (marked.count !== replaced.length) throw httpError(CHANGED, 409)
  }
  if (created.length) await tx.stockLog.createMany({ data: created })

  await applyChanges(tx, plan.changes)
  await settleRates(tx, plan.changes, [...replaced, ...shown])
  const emptied = await removeEmptiedRows(tx, plan.changes)
  if (emptied.length) await tx.deletion.update({ where: { id: record.id }, data: { removedRows: emptied } })
  return { id: record.id, refNo: document.refNo, changes }
}
