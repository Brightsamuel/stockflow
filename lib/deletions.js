import prisma from "@/lib/prisma"
import { httpError } from "@/lib/http"
import { fmtNum } from "@/lib/format"
import { ownerLabel } from "@/lib/owners"
import { LIVE, MOVEMENT, movementKind, signedChange } from "@/lib/movements"
import { NOTE_LOG_INCLUDE, findNote } from "@/lib/notes"

// Deleting a note (a received, issue or transfer note) takes back what its lines did to each
// store row: stock it received comes out again, stock it sent out returns to the store it left.
// Its lines are kept, marked with the deletion, and restoring the deletion applies them again.
// Nothing may take a row below zero, and a row sitting in a store's Removed items must be
// restored there first, unless the only things done to it since the note were store corrections
// (see correctionsSince). Everything runs inside the caller's transaction.

const EPS = 1e-9
const REASON_MAX = 500
const CHANGED = "The stock changed while this was being saved. Reload the page and try again."

function roundQty(value) {
  return Math.abs(value) < EPS ? 0 : Number(value.toPrecision(12))
}

// A store row: product, owner and whether (and for which project) it is kept
const rowKey = r => `${r.storeId}|${r.productId}|${r.ownerId}|${r.forProjectId ?? ""}`
const rowWhere = r => ({ storeId: r.storeId, productId: r.productId, ownerId: r.ownerId, forProjectId: r.forProjectId ?? null })

// Changes made to a row from the store itself rather than by a note
const CORRECTION_TYPES = ["EDIT", "DELETE", "RESTORE"]

// When undoing a note leaves a row removed, gone or short, and the row's only movements since the
// note are store corrections (a quantity edited, the item removed, restored or deleted for good),
// those were attempts to put the note right: deleting the note undoes them too, which takes the row
// back to exactly where it stood before the note. Returns the corrections, or null.
async function correctionsSince(tx, change, noteLogIds) {
  const later = await tx.stockLog.findMany({
    where: { ...rowWhere(change), ...LIVE, createdAt: { gte: change.since }, id: { notIn: noteLogIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  return later.length && later.every(l => CORRECTION_TYPES.includes(l.type)) ? later : null
}

// What undoing (direction −1) or re-applying (+1) the lines does to each store row they touch,
// and anything that stops it. `action` names it in messages, e.g. "deleting this note".
// undoCorrections: when deleting, also undo store corrections that would otherwise block it.
async function planChanges(tx, logs, direction, action, { undoCorrections = false } = {}) {
  const changes = new Map()
  for (const log of logs) {
    const key = rowKey(log)
    if (!changes.has(key)) {
      changes.set(key, {
        key,
        ...rowWhere(log),
        store: log.store.category.isSystem ? "the opening balance" : `${log.store.name}${log.forProject ? ` (kept for ${log.forProject.name})` : ""}`,
        product: log.product.name,
        unit: log.product.unit.name,
        owner: ownerLabel(log.owner),
        rate: log.rate,
        delta: 0,
        since: log.createdAt,
        corrections: null,
      })
    }
    const change = changes.get(key)
    change.delta += direction * signedChange(log)
    if (log.createdAt < change.since) change.since = log.createdAt
  }

  const list = [...changes.values()]
  const rows = await tx.stockEntry.findMany({ where: { OR: list.map(rowWhere) } })
  const rowsByKey = new Map(rows.map(r => [rowKey(r), r]))
  const noteLogIds = logs.map(l => l.id)
  const problems = []
  let shortage = false

  for (const change of list) {
    const row = rowsByKey.get(change.key) ?? null
    change.row = row
    change.before = row && !row.isDeleted ? row.quantity : 0
    const stuck = row?.isDeleted || (!row && change.delta < 0) || change.before + change.delta < -EPS
    if (undoCorrections && stuck) {
      change.corrections = await correctionsSince(tx, change, noteLogIds)
      for (const log of change.corrections ?? []) change.delta -= signedChange(log)
    }
    change.delta = roundQty(change.delta)
    change.after = roundQty(change.before + change.delta)

    const name = change.owner === "—" ? change.product : `${change.product} (${change.owner})`
    if (row?.isDeleted && !change.corrections) {
      problems.push(`${name} has been removed from ${change.store}. Restore it from the store's Removed items first.`)
    } else if (change.delta < 0 && !row) {
      problems.push(`${name} is no longer held in ${change.store}.`)
    } else if (change.after < 0) {
      shortage = true
      problems.push(`${name}: ${fmtNum(change.before)} ${change.unit} left in ${change.store}, but ${action} takes out ${fmtNum(-change.delta)}.`)
    }
  }
  return { changes: list, problems, hint: shortage ? SHORTAGE_HINT : null }
}

// Said once after the problems when stock has run short
const SHORTAGE_HINT = "Some of this stock has been moved on or used since. Delete or reverse those later movements first; each item's product history lists them."

function blockedMessage(verb, { problems, hint }) {
  return `This note can't be ${verb}. ${problems.join(" ")}${hint ? ` ${hint}` : ""}`
}

// What the confirm dialogs show for each store row
function describe({ changes, problems, hint }) {
  return {
    changes: changes
      .filter(c => c.delta || c.corrections)
      .map(c => ({
        key: c.key, productId: c.productId, store: c.store, product: c.product, owner: c.owner, unit: c.unit,
        before: c.before, delta: c.delta, after: c.after,
      })),
    corrections: undoneCorrections(changes),
    problems,
    hint,
  }
}

// The store corrections a deletion also undoes, for the confirm dialog and the deletion's record
function undoneCorrections(changes) {
  return changes.flatMap(c => (c.corrections ?? []).map(log => ({
    id: log.id,
    at: log.createdAt,
    store: c.store,
    product: c.product,
    what: log.note || MOVEMENT[movementKind(log)].label,
  })))
}

// Writes the planned quantities. Each update only succeeds if the row still holds what was read,
// so a stock movement saved at the same moment can't be lost. Rows that don't exist any more are
// recreated, from the row a deletion removed when there is one.
async function applyChanges(tx, changes, removedRows = []) {
  for (const change of changes) {
    // A removed row whose removal is undone comes back into the store, even with nothing in it
    if (change.row?.isDeleted && change.corrections) {
      const { count } = await tx.stockEntry.updateMany({
        where: { id: change.row.id, isDeleted: true, quantity: change.row.quantity },
        data: { quantity: change.after, isDeleted: false, deletedAt: null },
      })
      if (count !== 1) throw httpError(CHANGED, 409)
      continue
    }
    if (!change.delta) continue
    if (change.row) {
      const { count } = await tx.stockEntry.updateMany({
        where: { id: change.row.id, isDeleted: false, quantity: change.row.quantity },
        data: { quantity: change.after },
      })
      if (count !== 1) throw httpError(CHANGED, 409)
    } else {
      const removed = removedRows.find(r => rowKey(r) === change.key)
      await tx.stockEntry.create({
        data: {
          ...rowWhere(change),
          quantity: change.after,
          rate: removed?.rate ?? change.rate,
          lowStockAt: removed?.lowStockAt ?? 0,
        },
      })
    }
  }
}

// A receipt that set a row's rate stops doing so once deleted, and does again once restored: the
// row takes the rate of its latest live stock in or edit (or else of the transfer that first
// brought the item in), unless a later stock in or edit has set the rate since.
async function settleRates(tx, changes, logs) {
  for (const change of changes) {
    const received = logs.filter(l => l.type === "IN" && rowKey(l) === change.key)
    if (!received.length) continue
    const row = await tx.stockEntry.findFirst({ where: rowWhere(change) })
    if (!row || row.isDeleted) continue

    const live = { ...rowWhere(change), ...LIVE }
    const latest = new Date(Math.max(...received.map(l => l.createdAt.getTime())))
    const later = await tx.stockLog.findFirst({ where: { ...live, type: { in: ["IN", "EDIT"] }, createdAt: { gt: latest } }, select: { id: true } })
    if (later) continue

    const setter =
      (await tx.stockLog.findFirst({ where: { ...live, type: { in: ["IN", "EDIT"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { rate: true } })) ??
      (await tx.stockLog.findFirst({ where: { ...live, type: "TRANSFER_IN" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { rate: true } }))
    if (setter && setter.rate !== row.rate) await tx.stockEntry.update({ where: { id: row.id }, data: { rate: setter.rate } })
  }
}

// Rows a deletion emptied that have nothing else recorded against them go, as if never created.
// Returns what a restore needs to put them back.
async function removeEmptiedRows(tx, changes) {
  const removed = []
  for (const change of changes) {
    if (!change.row || change.after !== 0) continue
    if (await tx.stockLog.count({ where: { ...rowWhere(change), ...LIVE } })) continue
    await tx.stockEntry.delete({ where: { id: change.row.id } })
    removed.push({ ...rowWhere(change), rate: change.row.rate, lowStockAt: change.row.lowStockAt })
  }
  return removed
}

// Rows whose removal (or deletion for good) a deletion undid, so a restore can leave them as they
// were: `was` is "removed" (with the quantity it was removed with) or "gone".
function priorStates(changes) {
  return changes
    .filter(c => c.corrections && (!c.row || c.row.isDeleted))
    .map(c => ({
      ...rowWhere(c),
      rate: c.row?.rate ?? c.rate,
      lowStockAt: c.row?.lowStockAt ?? 0,
      ...(c.row ? { was: "removed", quantity: c.row.quantity, deletedAt: c.row.deletedAt } : { was: "gone" }),
    }))
}

// After a restore: a row the deletion brought back from removal (or from deletion for good) goes
// back to Removed items (or away again), unless stock has been added to it since
async function settlePriorStates(tx, removedRows) {
  for (const prior of removedRows.filter(r => r.was)) {
    const row = await tx.stockEntry.findFirst({ where: rowWhere(prior) })
    if (row && (row.isDeleted || row.quantity !== 0)) continue
    if (prior.was === "gone") {
      if (row) await tx.stockEntry.delete({ where: { id: row.id } })
    } else if (row) {
      await tx.stockEntry.update({ where: { id: row.id }, data: { isDeleted: true, quantity: prior.quantity, deletedAt: new Date(prior.deletedAt) } })
    } else {
      await tx.stockEntry.create({
        data: { ...rowWhere(prior), rate: prior.rate, lowStockAt: prior.lowStockAt, quantity: prior.quantity, isDeleted: true, deletedAt: new Date(prior.deletedAt) },
      })
    }
  }
}

// Deletes one note (see lib/notes findNote). preview: only describe what it would do.
export async function deleteNote(tx, { refNo = null, logId = null, documentId, reason, user, preview = false }) {
  const note = await findNote(tx, { refNo, logId }, documentId)
  if (!note) throw httpError("This note has changed or has already been deleted. Reload the page and try again.", 409)
  const { document, logs, transfers } = note
  if (!document.deletable) throw httpError("Opening balances can't be deleted as a note. Change them from Products.")

  const plan = await planChanges(tx, logs, -1, "deleting this note", { undoCorrections: true })
  if (preview) return describe(plan)
  if (plan.problems.length) throw httpError(blockedMessage("deleted", plan), 409)

  const why = typeof reason === "string" ? reason.trim() : ""
  if (!why) throw httpError("Enter the reason for deleting this note")
  if (why.length > REASON_MAX) throw httpError(`Keep the reason under ${REASON_MAX} characters`)
  const corrections = undoneCorrections(plan.changes)

  const deletion = await tx.deletion.create({
    data: {
      kind: document.kind,
      refNo: document.refNo,
      title: document.title,
      summary: document.summary,
      itemCount: document.lines.length,
      value: document.total,
      entryDate: new Date(Math.min(...logs.map(l => l.entryDate.getTime()))),
      reason: why,
      document: corrections.length ? { ...document, undoneCorrections: corrections } : document,
      userId: user.id,
    },
  })

  // The store corrections it undoes are kept with the note's lines, marked with the deletion
  const logIds = [...logs, ...plan.changes.flatMap(c => c.corrections ?? [])].map(l => l.id)
  const marked = await tx.stockLog.updateMany({ where: { id: { in: logIds }, ...LIVE }, data: { deletionId: deletion.id } })
  if (marked.count !== logIds.length) throw httpError(CHANGED, 409)
  if (transfers.length) {
    const markedTransfers = await tx.transfer.updateMany({ where: { id: { in: transfers.map(t => t.id) }, ...LIVE }, data: { deletionId: deletion.id } })
    if (markedTransfers.count !== transfers.length) throw httpError(CHANGED, 409)
  }

  await applyChanges(tx, plan.changes)
  await settleRates(tx, plan.changes, logs)
  const emptied = await removeEmptiedRows(tx, plan.changes)
  // One record per row: how it was before (for rows brought back from removal) and how to rebuild it
  const removedRows = [...priorStates(plan.changes), ...emptied].reduce((all, row) => {
    const same = all.find(r => rowKey(r) === rowKey(row))
    if (same) Object.assign(same, { rate: row.rate, lowStockAt: row.lowStockAt })
    else all.push(row)
    return all
  }, [])
  if (removedRows.length) await tx.deletion.update({ where: { id: deletion.id }, data: { removedRows } })
  return { id: deletion.id, title: deletion.title, refNo: deletion.refNo }
}

// Brings a deleted note back. preview: only describe what it would do.
export async function restoreDeletion(tx, { id, user, preview = false }) {
  const deletion = await tx.deletion.findUnique({
    where: { id },
    include: { logs: { include: NOTE_LOG_INCLUDE }, _count: { select: { transfers: true } } },
  })
  if (!deletion) throw httpError("Deleted note not found", 404)
  if (deletion.restoredAt) throw httpError("This note has already been restored", 409)

  const plan = await planChanges(tx, deletion.logs, 1, "restoring this note")
  if (preview) return describe(plan)
  if (plan.problems.length) throw httpError(blockedMessage("restored", plan), 409)

  // Claims the deletion first, so two people restoring it at once can't both succeed
  const claimed = await tx.deletion.updateMany({ where: { id, restoredAt: null }, data: { restoredAt: new Date(), restoredById: user.id } })
  if (claimed.count !== 1) throw httpError("This note has already been restored", 409)

  const logs = await tx.stockLog.updateMany({ where: { deletionId: id }, data: { deletionId: null } })
  const transfers = await tx.transfer.updateMany({ where: { deletionId: id }, data: { deletionId: null } })
  if (logs.count !== deletion.logs.length || transfers.count !== deletion._count.transfers) throw httpError(CHANGED, 409)

  const removedRows = Array.isArray(deletion.removedRows) ? deletion.removedRows : []
  await applyChanges(tx, plan.changes, removedRows)
  await settleRates(tx, plan.changes, deletion.logs)
  await settlePriorStates(tx, removedRows)
  return { id, title: deletion.title, refNo: deletion.refNo }
}

// Deleted notes, newest first, for the Documents page
export async function listDeletions(db = prisma) {
  const rows = await db.deletion.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { username: true } }, restoredBy: { select: { username: true } } },
  })
  return rows.map(d => ({
    id: d.id,
    kind: d.kind,
    title: d.title,
    refNo: d.refNo,
    summary: d.summary,
    itemCount: d.itemCount,
    value: d.value,
    entryDate: d.entryDate,
    reason: d.reason,
    document: d.document,
    deletedAt: d.createdAt,
    deletedBy: d.user?.username ?? null,
    restoredAt: d.restoredAt,
    restoredBy: d.restoredBy?.username ?? null,
  }))
}
