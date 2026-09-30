import crypto from "node:crypto"
import prisma from "@/lib/prisma"
import { ownerLabel } from "@/lib/owners"
import { fmtDate } from "@/lib/format"
import { LIVE } from "@/lib/movements"

// Printable notes for stock recorded together: everything under a ref no. or, for a stock in or
// stock out saved without one, the lines saved with it. One note per kind of movement, store and
// destination, each with its lines, total and signature blocks. A note is also what gets deleted
// (see lib/deletions), so each one carries the log lines and transfer rows behind it.
const NOTE_TYPES = {
  RECEIPT: { title: "Goods Received Note", signatures: ["Received by", "Delivered by", "Approved by"] },
  FIELD: { title: "Material Issue Note", subtitle: "Field use", signatures: ["Issued by", "Taken by", "Approved by"] },
  EXTERNAL: { title: "Goods Issue Note", subtitle: "Issued to an external party", signatures: ["Issued by", "Received by", "Approved by"] },
  TRANSFER: { title: "Stock Transfer Note", signatures: ["Dispatched by", "Received by", "Approved by"] },
}

export const NOTE_LOG_INCLUDE = {
  store: { select: { id: true, name: true, category: { select: { name: true, isSystem: true } } } },
  product: { include: { unit: true } },
  owner: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, location: true } },
  recipient: { select: { id: true, name: true, company: true } },
  user: { select: { username: true } },
}

const NOTE_TYPES_OF_LOG = ["IN", "TRANSFER_OUT", "TRANSFER_IN"]
// A stock out writes its transfer rows a moment before its log lines
const TRANSFER_WINDOW_MS = 60 * 1000

function storeLabel(store) {
  return store.category.isSystem ? "Opening balance" : `${store.name} (${store.category.name})`
}

function dateRange(dates) {
  const first = fmtDate(dates[0])
  const last = fmtDate(dates[dates.length - 1])
  return first === last ? first : `${first} – ${last}`
}

// Which lines make up the notes: { refNo } for a ref no., or { logId } for a line saved without
// one (the lines saved with it share its timestamp). A line that belongs to a ref no. resolves
// to that ref no. Returns null when there is nothing to show.
export async function noteScope(db, { refNo, logId }) {
  if (refNo) return { refNo }
  if (!logId) return null
  const log = await db.stockLog.findUnique({
    where: { id: logId },
    select: { refNo: true, createdAt: true, type: true, deletionId: true },
  })
  if (!log || log.deletionId || !NOTE_TYPES_OF_LOG.includes(log.type)) return null
  return log.refNo ? { refNo: log.refNo } : { refNo: null, createdAt: log.createdAt }
}

// Rows on both sides match on product, owner, quantity and date
function sameLine(a, b) {
  return a.productId === b.productId && a.ownerId === b.ownerId && a.quantity === b.quantity &&
    a.entryDate.getTime() === b.entryDate.getTime()
}

// Takes the row in `pool` that passes `test` and was written closest in time to `at`
function takeClosest(pool, test, at) {
  let best = -1
  pool.forEach((row, i) => {
    if (test(row) && (best === -1 || Math.abs(row.createdAt - at) < Math.abs(pool[best].createdAt - at))) best = i
  })
  return best === -1 ? null : pool.splice(best, 1)[0]
}

async function loadGroups(db, scope) {
  const logWhere = scope.refNo ? { refNo: scope.refNo } : { refNo: null, createdAt: scope.createdAt }
  const transferWhere = scope.refNo
    ? { refNo: scope.refNo }
    : { refNo: null, createdAt: { gte: new Date(scope.createdAt.getTime() - TRANSFER_WINDOW_MS), lte: scope.createdAt } }

  const [logs, transfers] = await Promise.all([
    db.stockLog.findMany({
      where: { ...logWhere, ...LIVE, type: { in: NOTE_TYPES_OF_LOG } },
      include: NOTE_LOG_INCLUDE,
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    db.transfer.findMany({
      where: { ...transferWhere, ...LIVE },
      include: { targetStore: { select: { id: true, name: true, category: { select: { name: true } } } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ])

  const transferPool = [...transfers]
  const receivedPool = logs.filter(l => l.type === "TRANSFER_IN")
  const groups = new Map()

  for (const log of logs) {
    if (log.type === "TRANSFER_IN") continue // shown as part of the transfer that sent it
    let kind, key, destination = null, transfer = null, received = null

    if (log.type === "IN") {
      kind = "RECEIPT"
      key = `R|${log.storeId}`
    } else {
      // The transfer row this stock out wrote
      transfer = takeClosest(transferPool, t =>
        t.sourceStoreId === log.storeId && sameLine(t, log) &&
        t.projectId === log.projectId && t.recipientId === log.recipientId, log.createdAt)

      if (log.projectId) {
        kind = "FIELD"
        destination = log.project.location ? `${log.project.name} (${log.project.location})` : log.project.name
        key = `F|${log.storeId}|${log.projectId}|${log.takenBy ?? ""}`
      } else if (log.recipientId) {
        kind = "EXTERNAL"
        destination = `${log.recipient.name}${log.recipient.company ? ` (${log.recipient.company})` : ""}`
        key = `E|${log.storeId}|${log.recipientId}|${log.takenBy ?? ""}`
      } else {
        kind = "TRANSFER"
        // …and the line that received it in the other store
        const targetId = transfer?.targetStoreId
        received = takeClosest(receivedPool, r =>
          (targetId ? r.storeId === targetId : r.storeId !== log.storeId) && sameLine(r, log), log.createdAt)
        const target = transfer?.targetStore ?? received?.store
        destination = target ? `${target.name} (${target.category.name})` : log.note?.replace(/^Transferred to /, "") ?? "Another store"
        key = `T|${log.storeId}|${targetId ?? received?.storeId ?? destination}`
      }
    }

    if (!groups.has(key)) {
      groups.set(key, {
        kind,
        store: storeLabel(log.store),
        openingBalance: log.store.category.isSystem,
        destination,
        takenBy: log.takenBy,
        recipient: log.recipient?.name,
        lines: [],
      })
    }
    groups.get(key).lines.push({ log, transfer, received })
  }

  return [...groups.values()]
}

// Stable while the note's lines stay the same, so a delete acts on exactly the note on screen
function noteId(group) {
  const ids = group.lines.flatMap(({ log, transfer, received }) => [log.id, transfer?.id, received?.id]).filter(Boolean).sort()
  return crypto.createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 16)
}

function toDocument(group, refNo) {
  const type = NOTE_TYPES[group.kind]
  const logs = group.lines.map(line => line.log)
  const users = [...new Set(logs.map(l => l.user?.username).filter(Boolean))].join(", ")
  const date = dateRange(logs.map(l => l.entryDate))

  const meta = refNo ? [["Ref no.", refNo]] : []
  meta.push(["Date", date])
  if (group.kind === "RECEIPT") meta.push(["Received into", group.store])
  else meta.push(["From", group.store], [group.kind === "FIELD" ? "Project" : group.kind === "EXTERNAL" ? "Issued to" : "To", group.destination])
  if (group.takenBy) meta.push(["Taken by", group.takenBy])
  if (users) meta.push(["Recorded by", users])

  const names = {
    "Received by": group.kind === "RECEIPT" ? users : group.kind === "EXTERNAL" ? group.takenBy || group.recipient : "",
    "Issued by": users,
    "Dispatched by": users,
    "Taken by": group.takenBy ?? "",
  }

  const lines = logs.map(l => ({
    product: l.product.name,
    owner: ownerLabel(l.owner),
    unit: l.product.unit.name,
    quantity: l.quantity,
    rate: l.rate,
    amount: l.quantity * l.rate,
  }))

  return {
    id: noteId(group),
    kind: group.kind,
    title: type.title,
    subtitle: type.subtitle ?? null,
    refNo: refNo ?? null,
    date,
    summary: group.kind === "RECEIPT" ? `Received into ${group.store}` : `${group.store} → ${group.destination}`,
    meta,
    lines,
    total: lines.reduce((s, line) => s + line.amount, 0),
    signatures: type.signatures.map(label => ({ label, name: names[label] || "" })),
    // Opening balances are changed from Products, not deleted as notes
    deletable: !(group.kind === "RECEIPT" && group.openingBalance),
  }
}

// The notes for a ref no. or a line saved without one (see noteScope)
export async function buildNotes({ refNo = null, logId = null }, db = prisma) {
  const scope = await noteScope(db, { refNo, logId })
  if (!scope) return []
  const groups = await loadGroups(db, scope)
  return groups.map(group => toDocument(group, scope.refNo))
}

// One note with the rows behind it: its log lines (including the lines that received a transfer)
// and transfer rows. Null when the note no longer exists as shown (changed or deleted since).
export async function findNote(db, { refNo = null, logId = null }, noteDocumentId) {
  const scope = await noteScope(db, { refNo, logId })
  if (!scope) return null
  const groups = await loadGroups(db, scope)
  for (const group of groups) {
    const document = toDocument(group, scope.refNo)
    if (document.id !== noteDocumentId) continue
    return {
      document,
      logs: group.lines.flatMap(({ log, received }) => (received ? [log, received] : [log])),
      transfers: group.lines.map(line => line.transfer).filter(Boolean),
    }
  }
  return null
}
