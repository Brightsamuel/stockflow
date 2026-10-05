import prisma from "@/lib/prisma"
import { httpError } from "@/lib/http"
import { LIVE } from "@/lib/movements"
import { NEEDS_APPROVAL, buildNotes, findNote } from "@/lib/notes"

// Approvers sign off stock outs (issue notes to a project or an external party) after the stock
// has left: approving puts their name on the note's "Approved by" line; querying holds the note
// back with a comment until it is approved. Each decision is an Approval record the note's lines
// point at; earlier decisions stay on record.

const COMMENT_MAX = 500
const NOT_APPROVED = { OR: [{ approvalId: null }, { approval: { status: { not: "APPROVED" } } }] }

// Stock-out lines that still need an approver's sign-off (queried ones included)
const PENDING_LINES = {
  ...LIVE,
  type: "TRANSFER_OUT",
  OR: [{ projectId: { not: null } }, { recipientId: { not: null } }],
  AND: [NOT_APPROVED],
}

// action: "approve" | "query". Runs inside the caller's transaction.
export async function decideNote(tx, { refNo = null, logId = null, documentId, action, comment, user }) {
  if (!["approve", "query"].includes(action)) throw httpError("Choose whether to approve or query the note")
  const note = await findNote(tx, { refNo, logId }, documentId)
  if (!note) throw httpError("This note has changed or has been deleted. Reload the page and try again.", 409)
  const { document, logs } = note
  if (!NEEDS_APPROVAL.includes(document.kind)) throw httpError("Only issue notes (stock outs) are approved in the system")
  if (document.approval.status === "APPROVED") throw httpError("This note has already been approved", 409)
  if (action === "approve" && document.recordedByIds.includes(user.id))
    throw httpError("You recorded this stock out, so another approver must approve it", 403)

  const text = typeof comment === "string" ? comment.trim() : ""
  if (action === "query" && !text) throw httpError("Say what needs checking before it can be approved")
  if (text.length > COMMENT_MAX) throw httpError(`Keep the comment under ${COMMENT_MAX} characters`)

  const pending = logs.filter(l => l.type === "TRANSFER_OUT" && l.approval?.status !== "APPROVED")
  const approval = await tx.approval.create({
    data: {
      status: action === "approve" ? "APPROVED" : "QUERIED",
      comment: text || null,
      kind: document.kind,
      refNo: document.refNo,
      title: document.title,
      summary: document.summary,
      userId: user.id,
    },
  })
  const { count } = await tx.stockLog.updateMany({
    where: { id: { in: pending.map(l => l.id) }, ...LIVE, ...NOT_APPROVED },
    data: { approvalId: approval.id },
  })
  if (count !== pending.length) throw httpError("This note changed while it was being saved. Reload the page and try again.", 409)
  return { id: approval.id, status: approval.status, title: document.title, refNo: document.refNo }
}

// Issue notes awaiting approval or queried, newest first, each with the scope it was found by
// ({ refNo } or { logId }) so the page can act on it
export async function listPendingNotes(db = prisma) {
  const lines = await db.stockLog.findMany({
    where: PENDING_LINES,
    select: { id: true, refNo: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  })
  const scopes = new Map()
  for (const l of lines) {
    const key = l.refNo ? `ref:${l.refNo}` : `at:${l.createdAt.toISOString()}`
    if (!scopes.has(key)) scopes.set(key, l.refNo ? { refNo: l.refNo, logId: null } : { refNo: null, logId: l.id })
  }
  const notes = []
  for (const scope of [...scopes.values()].slice(0, 80)) {
    for (const doc of await buildNotes(scope, db)) {
      if (doc.approval.needed && doc.approval.status !== "APPROVED") notes.push({ ...doc, scope })
    }
  }
  return notes
}

// How many issue notes are waiting for an approver (queried ones not counted), for the menu
export async function countAwaiting(db = prisma) {
  const lines = await db.stockLog.findMany({
    where: { ...PENDING_LINES, approvalId: null },
    select: { refNo: true, createdAt: true },
    take: 500,
  })
  return new Set(lines.map(l => (l.refNo ? `ref:${l.refNo}` : `at:${l.createdAt.toISOString()}`))).size
}

// Recent decisions, newest first
export async function listRecentDecisions(db = prisma, take = 60) {
  const rows = await db.approval.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { username: true } }, _count: { select: { logs: true } } },
  })
  return rows.map(a => ({
    id: a.id,
    status: a.status,
    comment: a.comment,
    title: a.title,
    refNo: a.refNo,
    summary: a.summary,
    by: a.user?.username ?? null,
    at: a.createdAt,
    lines: a._count.logs,
  }))
}
