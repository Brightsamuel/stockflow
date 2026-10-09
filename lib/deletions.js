import prisma from "@/lib/prisma"
import { httpError } from "@/lib/http"
import { fmtDate, fmtNum, plural } from "@/lib/format"
import { NO_OWNER, ownerLabel } from "@/lib/owners"
import { LIVE, MOVEMENT, dayOf, isArrival, movementKind, signedChange } from "@/lib/movements"
import { NOTE_LOG_INCLUDE, findNote, notesOfLines } from "@/lib/notes"

// Deleting a note (a received, issue or transfer note) takes back what its lines did to each
// store row: stock it received comes out again, stock it sent out returns to the store it left.
// Its lines are kept, marked with the deletion, and restoring the deletion applies them again.
// Nothing may take a row below zero, and a row sitting in a store's Removed items must be
// restored there first, unless the only things done to it since the note were store corrections
// (see correctionsSince). When the note's stock was issued or moved on since, the notes that did
// so go with it, ticked one by one by whoever deletes it (see followUps). Everything runs inside
// the caller's transaction.

const EPS = 1e-9
export const REASON_MAX = 500
export const CHANGED = "The stock changed while this was being saved. Reload the page and try again."

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

// What undoing (direction −1) or applying (+1) lines does to each store row they touch, and
// anything that stops it. lines: [{ log, direction }] (an edit undoes old lines and applies new
// ones in one plan). `action` names it in messages, e.g. "deleting this note".
// undoCorrections: when deleting, also undo store corrections that would otherwise block it.
export async function planChanges(tx, lines, action, { undoCorrections = false } = {}) {
  const changes = new Map()
  const logs = lines.map(line => line.log)
  for (const { log, direction } of lines) {
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
  const noteLogIds = logs.map(l => l.id).filter(Boolean)
  const problems = []
  let shortage = false

  for (const change of list) {
    change.row = rowsByKey.get(change.key) ?? null
    change.before = change.row && !change.row.isDeleted ? change.row.quantity : 0
  }
  // The store corrections of every row that would be stuck, looked up together
  if (undoCorrections) {
    const stuck = list.filter(c => c.row?.isDeleted || (!c.row && c.delta < 0) || c.before + c.delta < -EPS)
    const found = await Promise.all(stuck.map(c => correctionsSince(tx, c, noteLogIds)))
    stuck.forEach((change, i) => {
      change.corrections = found[i]
      for (const log of change.corrections ?? []) change.delta -= signedChange(log)
    })
  }

  for (const change of list) {
    const { row } = change
    change.delta = roundQty(change.delta)
    change.after = roundQty(change.before + change.delta)

    // Kept on the row too, so a deletion can look for the notes that would put it right
    const name = itemName(change)
    if (row?.isDeleted && !change.corrections) {
      change.problem = `${name} has been removed from ${change.store}. Restore it from the store's Removed items first.`
    } else if (change.delta < 0 && !row) {
      change.problem = `${name} is no longer held in ${change.store}.`
    } else if (change.after < 0) {
      shortage = true
      change.problem = `${name}: ${fmtNum(change.before)} ${change.unit} left in ${change.store}, but ${action} takes out ${fmtNum(-change.delta)}.`
    }
    if (change.problem) problems.push(change.problem)
  }
  return { changes: list, problems, hint: shortage ? SHORTAGE_HINT : null }
}

const itemName = c => (c.owner === "—" ? c.product : `${c.product} (${c.owner})`)

// Said once after the problems when stock has run short
const SHORTAGE_HINT = "Some of this stock has been moved on or used since. Delete or reverse those later movements first; each item's product history lists them."

export function blockedMessage(verb, { problems, hint }) {
  return `This note can't be ${verb}. ${problems.join(" ")}${hint ? ` ${hint}` : ""}`
}

// What the confirm dialogs show for each store row
export function describe({ changes, problems, hint }) {
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
export async function applyChanges(tx, changes, removedRows = []) {
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
export async function settleRates(tx, changes, logs) {
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
export async function removeEmptiedRows(tx, changes) {
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

// ── Notes that go with a deletion ───────────────────────────────────────────
// A note whose stock was issued or moved on can't go alone: the notes that took its stock would
// then be moving stock that was never there, and the numbers would stop adding up. Whoever deletes
// it is shown those notes and ticks each one (withNotes); all of it becomes one deletion, restored
// together. With the ticked notes counted as gone, three things are checked:
//  1. a row left short, removed or gone: the stock outs from it. If the row only ever held stock
//     from the notes being deleted, every one of them must go. If it holds other stock too, only
//     those issued in error need to, enough to cover it (from the day this stock arrived);
//  2. a project can't have sent back more than would still be issued to it: its returns;
//  3. nothing may go out of a row before its first arrival (as when recording, see lib/stockMove):
//     stock outs dated before the first arrival left.
const WITH_MAX = 100
const LINE_SELECT = { id: true, refNo: true, createdAt: true, entryDate: true, quantity: true }
const TICK_HINT = "Tick the notes listed to delete them with this one."

const earliest = logs => logs.reduce((first, l) => (!first || l.entryDate < first.entryDate ? l : first), null)

async function followUps(tx, plan, logs) {
  const gone = new Set(logs.map(l => l.id))
  const problems = []
  const waiting = []
  const wanted = new Map()
  const want = lines => lines.forEach(l => wanted.set(l.id, l))
  let shortage = false

  // Everything still counting on the rows it touches, read once
  const onRows = new Map(plan.changes.map(c => [c.key, []]))
  const rowLogs = await tx.stockLog.findMany({
    where: { ...LIVE, OR: plan.changes.map(rowWhere) },
    select: { ...LINE_SELECT, type: true, adjustment: true, storeId: true, productId: true, ownerId: true, forProjectId: true },
  })
  for (const l of rowLogs) onRows.get(rowKey(l))?.push(l)

  for (const change of plan.changes) {
    if (!change.problem) continue
    const rest = onRows.get(change.key).filter(l => !gone.has(l.id))
    const others = rest.filter(isArrival).length
    const arrived = earliest(logs.filter(l => rowKey(l) === change.key && isArrival(l)))
    const from = others && arrived ? dayOf(arrived.entryDate) : null
    let outs = rest.filter(l => l.type === "TRANSFER_OUT" && (!from || dayOf(l.entryDate) >= from))
    // A row taken out of the store (or deleted for good) only comes back as it was if it never held
    // other stock and all else done to it was store corrections, which are then undone too
    const corrected = rest.filter(l => l.type !== "TRANSFER_OUT")
    if ((!change.row || change.row.isDeleted) && (others || !corrected.length || !corrected.every(l => CORRECTION_TYPES.includes(l.type)))) outs = []
    if (!outs.length) {
      problems.push(change.problem)
      if (change.after < 0) shortage = true
      continue
    }
    want(outs)
    const out = roundQty(outs.reduce((sum, l) => sum + l.quantity, 0))
    waiting.push(others
      ? `${itemName(change)} in ${change.store} also holds other stock, so only the stock outs made in error need to go${change.after < 0 ? `, enough for ${fmtNum(-change.after)} ${change.unit}` : ""}.`
      : `${itemName(change)} in ${change.store}: ${fmtNum(out)} ${change.unit} of it went out after it came in.`)
  }

  const issueKey = l => `${l.storeId}|${l.projectId}|${l.productId}|${l.ownerId}`
  const issues = new Map()
  for (const l of logs) {
    if (l.type === "TRANSFER_OUT" && l.projectId) issues.set(issueKey(l), l)
  }
  const projectLogs = issues.size ? await tx.stockLog.findMany({
    where: {
      ...LIVE, type: { in: ["TRANSFER_OUT", "RETURN"] },
      OR: [...issues.values()].map(l => ({ storeId: l.storeId, projectId: l.projectId, productId: l.productId, ownerId: l.ownerId })),
    },
    select: { ...LINE_SELECT, type: true, storeId: true, projectId: true, productId: true, ownerId: true },
  }) : []
  for (const [key, l] of issues) {
    const left = projectLogs.filter(p => issueKey(p) === key && !gone.has(p.id))
    const returns = left.filter(p => p.type === "RETURN")
    const out = left.filter(p => p.type === "TRANSFER_OUT").reduce((sum, p) => sum + p.quantity, 0)
    const back = returns.reduce((sum, r) => sum + r.quantity, 0)
    if (back - out <= EPS) continue
    want(returns)
    waiting.push(`${l.product.name}: ${l.project.name} has sent ${fmtNum(back)} ${l.product.unit.name} back to ${l.store.name}, more than would still be issued to it (${fmtNum(roundQty(out))}).`)
  }

  for (const change of plan.changes) {
    if (change.problem || !logs.some(l => rowKey(l) === change.key && isArrival(l))) continue
    const arrivals = onRows.get(change.key).filter(isArrival)
    const first = earliest(arrivals)
    const left = earliest(arrivals.filter(a => !gone.has(a.id)))
    if (!first || !left || dayOf(left.entryDate) <= dayOf(first.entryDate)) continue
    const early = onRows.get(change.key)
      .filter(l => l.type === "TRANSFER_OUT" && !gone.has(l.id) && !wanted.has(l.id) && dayOf(l.entryDate) < dayOf(left.entryDate) && dayOf(l.entryDate) >= dayOf(first.entryDate))
    if (!early.length) continue
    want(early)
    waiting.push(`${itemName(change)} in ${change.store}: what is left there first arrived on ${fmtDate(left.entryDate)}, so ${early.length === 1 ? "the stock out" : `the ${early.length} stock outs`} dated before that must go too.`)
  }

  const notes = await notesOfLines(tx, [...wanted.values()])
  return { problems, waiting, hint: shortage ? SHORTAGE_HINT : null, candidates: notes.map(n => dependent(n, false)) }
}

// How the dialog lists a note that goes with the deletion; refNo or logId and documentId find it again
function dependent({ refNo, logId, document, at }, ticked) {
  return {
    refNo, logId, documentId: document.id, ticked, at,
    kind: document.kind, title: document.title, date: document.date, summary: document.summary,
    lines: document.lines.map(l => ({ product: l.product, owner: l.owner, unit: l.unit, quantity: l.quantity })),
  }
}

// The notes ticked to go with the one being deleted, as findNote returns them
async function findWithNotes(tx, main, withNotes) {
  if (!Array.isArray(withNotes)) throw httpError("Choose the notes to delete with it")
  if (withNotes.length > WITH_MAX) throw httpError(`At most ${WITH_MAX} notes can be deleted with one note`)
  const found = await Promise.all(withNotes.map(async w => {
    const refNo = typeof w?.refNo === "string" && w.refNo.trim() ? w.refNo.trim() : null
    const logId = !refNo && typeof w?.logId === "string" ? w.logId : null
    const note = typeof w?.documentId === "string" && (refNo || logId) ? await findNote(tx, { refNo, logId }, w.documentId) : null
    return { refNo, logId, note }
  }))
  const seen = new Set([main.document.id])
  const notes = []
  for (const { refNo, logId, note } of found) {
    if (!note) throw httpError("One of the notes ticked to go with it has changed or has been deleted. Reload the page and try again.", 409)
    if (!note.document.deletable) throw httpError("Opening balances can't be deleted as a note. Change them from Products.")
    if (seen.has(note.document.id)) continue
    seen.add(note.document.id)
    notes.push({ ...note, refNo, logId, at: earliest(note.logs).entryDate })
  }
  return notes
}

// What the notes being deleted issued to projects and external parties, which stops counting as
// used or issued: [{ to, items: [{ product, owner, unit, quantity }] }]
function issuedTotals(logs) {
  const destinations = new Map()
  for (const l of logs) {
    if (l.type !== "TRANSFER_OUT" || (!l.projectId && !l.recipientId)) continue
    const to = l.project ? l.project.name : l.recipient.name
    if (!destinations.has(to)) destinations.set(to, new Map())
    const items = destinations.get(to)
    const key = `${l.productId}|${l.ownerId}`
    if (!items.has(key)) items.set(key, { product: l.product.name, owner: ownerLabel(l.owner), unit: l.product.unit.name, quantity: 0 })
    items.get(key).quantity += l.quantity
  }
  return [...destinations].map(([to, items]) => ({ to, items: [...items.values()].map(i => ({ ...i, quantity: roundQty(i.quantity) })) }))
}

// Deletes one note (see lib/notes findNote), with the notes ticked to go with it (withNotes:
// [{ refNo | logId, documentId }]). preview: only describe what it would do, with the notes that
// would have to go with it.
export async function deleteNote(tx, { refNo = null, logId = null, documentId, withNotes = [], reason, user, preview = false }) {
  const note = await findNote(tx, { refNo, logId }, documentId)
  if (!note) throw httpError("This note has changed or has already been deleted. Reload the page and try again.", 409)
  const { document } = note
  if (!document.deletable) throw httpError("Opening balances can't be deleted as a note. Change them from Products.")
  const others = await findWithNotes(tx, note, withNotes)
  const logs = [note, ...others].flatMap(n => n.logs)
  const transfers = [note, ...others].flatMap(n => n.transfers)

  const plan = await planChanges(tx, logs.map(log => ({ log, direction: -1 })), "deleting this note", { undoCorrections: true })
  const follow = await followUps(tx, plan, logs)
  if (preview) {
    return {
      ...describe(plan),
      problems: follow.problems,
      waiting: follow.waiting,
      hint: follow.hint,
      dependents: [...others.map(n => dependent(n, true)), ...follow.candidates].sort((a, b) => a.at - b.at || a.title.localeCompare(b.title)),
      issued: issuedTotals(logs),
    }
  }
  const blocks = [...follow.waiting, ...follow.problems]
  if (blocks.length) throw httpError(blockedMessage("deleted", { problems: blocks, hint: follow.waiting.length ? TICK_HINT : follow.hint }), 409)

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
      entryDate: new Date(Math.min(...note.logs.map(l => l.entryDate.getTime()))),
      reason: why,
      document: {
        ...document,
        ...(corrections.length ? { undoneCorrections: corrections } : {}),
        // The notes deleted with it, as they read
        ...(others.length ? { withNotes: others.map(n => n.document) } : {}),
      },
      userId: user.id,
    },
  })

  // The lines of the note and of the notes deleted with it, and the store corrections it undoes,
  // are all marked with the deletion
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
  return { id: deletion.id, title: deletion.title, refNo: deletion.refNo, withNotes: others.length }
}

// Deleting a removed item for good (Super admin). When everything recorded on its row is stock
// received on notes plus store corrections, all of it goes with the row: the lines are kept, marked
// with a deletion, and leave stock, reports, product history and the notes they were on. Restoring
// the deletion puts the item back in Removed items with its history. A row whose stock was issued,
// moved or brought in from elsewhere keeps its history, since those movements depend on it, and only
// the row goes. preview: only describe what it would do.
const ERASABLE_TYPES = ["IN", ...CORRECTION_TYPES]
const SHOWN_MAX = 3

export async function eraseRemovedItem(tx, { entryId, reason, user, preview = false }) {
  const row = await tx.stockEntry.findUnique({
    where: { id: entryId },
    include: {
      store: { include: { category: { select: { name: true, isSystem: true } } } },
      product: { include: { unit: true } },
      owner: { select: { id: true, name: true } },
      forProject: { select: { name: true } },
    },
  })
  if (!row || row.store.category.isSystem) throw httpError("Item not found", 404)
  if (!row.isDeleted) throw httpError("Remove the item from the store first")

  const logs = await tx.stockLog.findMany({
    where: { ...rowWhere(row), ...LIVE },
    include: NOTE_LOG_INCLUDE,
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  })
  const store = `${row.store.name} (${row.store.category.name})${row.forProject ? `, kept for ${row.forProject.name}` : ""}`
  const kept = logs.filter(l => !ERASABLE_TYPES.includes(l.type))
  const balance = roundQty(logs.reduce((sum, l) => sum + signedChange(l), 0))
  const erasable = kept.length === 0 && balance === 0
  const receipts = logs.filter(l => l.type === "IN")

  // Each receipt line and the note it is on: the note goes if this is its only line
  const received = []
  for (const log of receipts) {
    const others = await tx.stockLog.count({
      where: {
        ...LIVE, type: "IN", storeId: log.storeId, forProjectId: log.forProjectId, id: { notIn: receipts.map(l => l.id) },
        ...(log.refNo ? { refNo: log.refNo } : { refNo: null, createdAt: log.createdAt }),
      },
    })
    received.push({ log, others })
  }
  const describeKept = kept.slice(0, SHOWN_MAX).map(l => `${MOVEMENT[movementKind(l)].label} ${fmtNum(l.quantity)} ${row.product.unit.name} on ${fmtDate(l.entryDate)}${l.note ? ` (${l.note})` : ""}`)
  if (kept.length > SHOWN_MAX) describeKept.push(`and ${kept.length - SHOWN_MAX} more`)

  if (preview) {
    return {
      product: row.product.name,
      unit: row.product.unit.name,
      owner: ownerLabel(row.owner),
      store,
      erasable,
      receipts: received.map(({ log, others }) => ({
        id: log.id, refNo: log.refNo, date: log.entryDate, quantity: log.quantity, rate: log.rate, otherLines: others,
      })),
      corrections: logs.filter(l => CORRECTION_TYPES.includes(l.type)).map(l => ({ id: l.id, at: l.createdAt, what: l.note || MOVEMENT[movementKind(l)].label })),
      kept: describeKept,
    }
  }

  // Not erasable: only the row goes, its history stays (as before)
  if (!erasable) {
    const { count } = await tx.stockEntry.deleteMany({ where: { id: row.id, isDeleted: true } })
    if (count !== 1) throw httpError(CHANGED, 409)
    return { erased: false }
  }

  const why = typeof reason === "string" ? reason.trim() : ""
  if (!why) throw httpError("Enter the reason for deleting this item for good")
  if (why.length > REASON_MAX) throw httpError(`Keep the reason under ${REASON_MAX} characters`)

  const refs = [...new Set(receipts.map(l => l.refNo).filter(Boolean))]
  const lines = receipts.map(l => ({
    product: row.product.name, owner: ownerLabel(row.owner), unit: row.product.unit.name, quantity: l.quantity, rate: l.rate, amount: l.quantity * l.rate,
  }))
  const document = {
    kind: "ITEM",
    title: "Item deleted for good",
    subtitle: `${row.product.name} · ${store}`,
    meta: [
      ["Item", row.product.name],
      ["Store", store],
      ...(row.owner.id === NO_OWNER ? [] : [["Owner", row.owner.name]]),
      ["Received on", received.map(({ log, others }) =>
        `${log.refNo ? `Goods Received Note ${log.refNo}` : "a Goods Received Note with no ref no."} (${fmtDate(log.entryDate)}${others ? `; ${plural(others, "other line")} stay on it` : ""})`).join("; ") || "—"],
      ["Also undone", logs.filter(l => CORRECTION_TYPES.includes(l.type)).map(l => `${fmtDate(l.createdAt)}: ${l.note || MOVEMENT[movementKind(l)].label}`).join("; ") || "—"],
    ],
    lines,
    signatures: [],
  }

  const deletion = await tx.deletion.create({
    data: {
      kind: "ITEM",
      refNo: refs.length === 1 ? refs[0] : null,
      title: document.title,
      summary: `${row.product.name} · ${store}`,
      itemCount: receipts.length,
      value: lines.reduce((sum, l) => sum + l.amount, 0),
      entryDate: logs.length ? logs[0].entryDate : row.createdAt,
      reason: why,
      document,
      // A restore puts the item back in Removed items, as it was
      removedRows: [{ ...rowWhere(row), rate: row.rate, lowStockAt: row.lowStockAt, was: "removed", quantity: row.quantity, deletedAt: row.deletedAt }],
      userId: user.id,
    },
  })
  const marked = await tx.stockLog.updateMany({ where: { id: { in: logs.map(l => l.id) }, ...LIVE }, data: { deletionId: deletion.id } })
  if (marked.count !== logs.length) throw httpError(CHANGED, 409)
  const { count } = await tx.stockEntry.deleteMany({ where: { id: row.id, isDeleted: true } })
  if (count !== 1) throw httpError(CHANGED, 409)
  return { erased: true, id: deletion.id }
}

// Brings a deleted note back. preview: only describe what it would do.
export async function restoreDeletion(tx, { id, user, preview = false }) {
  const deletion = await tx.deletion.findUnique({
    where: { id },
    include: { logs: { include: NOTE_LOG_INCLUDE }, _count: { select: { transfers: true } } },
  })
  if (!deletion) throw httpError("Deleted note not found", 404)
  if (deletion.action === "EDIT") throw httpError("An edit can't be undone from here. Edit the note again to change it.")
  if (deletion.restoredAt) throw httpError("This note has already been restored", 409)

  const plan = await planChanges(tx, deletion.logs.map(log => ({ log, direction: 1 })), "restoring this note")
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

// Deleted notes and items, newest first, for the Documents page (edits are shown on their notes)
export async function listDeletions(db = prisma) {
  const rows = await db.deletion.findMany({
    where: { action: "DELETE" },
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
