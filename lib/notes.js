import prisma from "@/lib/prisma"
import { ownerLabel } from "@/lib/owners"
import { fmtDate } from "@/lib/format"

// Printable documents for everything recorded under a ref no.: one per kind of movement,
// store and destination, each with the lines, the total and signature blocks.
const NOTE_TYPES = {
  RECEIPT: { title: "Goods Received Note", signatures: ["Received by", "Delivered by", "Approved by"] },
  FIELD: { title: "Material Issue Note", subtitle: "Field use", signatures: ["Issued by", "Taken by", "Approved by"] },
  EXTERNAL: { title: "Goods Issue Note", subtitle: "Issued to an external party", signatures: ["Issued by", "Received by", "Approved by"] },
  TRANSFER: { title: "Stock Transfer Note", signatures: ["Dispatched by", "Received by", "Approved by"] },
}

function storeLabel(store) {
  return store.category.isSystem ? "Opening balance" : `${store.name} (${store.category.name})`
}

function dateRange(dates) {
  const first = fmtDate(dates[0])
  const last = fmtDate(dates[dates.length - 1])
  return first === last ? first : `${first} – ${last}`
}

export async function buildNotes(refNo) {
  const [logs, transfers] = await Promise.all([
    prisma.stockLog.findMany({
      where: { refNo, type: { in: ["IN", "TRANSFER_OUT"] } },
      include: {
        store: { select: { id: true, name: true, category: { select: { name: true, isSystem: true } } } },
        product: { include: { unit: true } },
        owner: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, location: true } },
        recipient: { select: { id: true, name: true, company: true } },
        user: { select: { username: true } },
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.transfer.findMany({
      where: { refNo, targetStoreId: { not: null } },
      select: {
        sourceStoreId: true, productId: true, ownerId: true, quantity: true, entryDate: true,
        targetStore: { select: { name: true, category: { select: { name: true } } } },
      },
    }),
  ])

  // The destination store of each store-to-store line, matched on the transfer row it wrote
  const lineKey = t => [t.sourceStoreId ?? t.storeId, t.productId, t.ownerId, t.quantity, t.entryDate.toISOString()].join("|")
  const targets = new Map()
  transfers.forEach(t => {
    const key = lineKey(t)
    if (!targets.has(key)) targets.set(key, [])
    targets.get(key).push(`${t.targetStore.name} (${t.targetStore.category.name})`)
  })

  const groups = new Map()
  for (const l of logs) {
    let kind, destination, key
    if (l.type === "IN") {
      kind = "RECEIPT"
      key = `R:${l.storeId}`
    } else if (l.projectId) {
      kind = "FIELD"
      destination = l.project.location ? `${l.project.name} (${l.project.location})` : l.project.name
      key = `F:${l.storeId}:${l.projectId}:${l.takenBy ?? ""}`
    } else if (l.recipientId) {
      kind = "EXTERNAL"
      destination = `${l.recipient.name}${l.recipient.company ? ` (${l.recipient.company})` : ""}`
      key = `E:${l.storeId}:${l.recipientId}:${l.takenBy ?? ""}`
    } else {
      kind = "TRANSFER"
      destination = targets.get(lineKey(l))?.shift() ?? l.note?.replace(/^Transferred to /, "") ?? "Another store"
      key = `T:${l.storeId}:${destination}`
    }

    if (!groups.has(key)) {
      groups.set(key, { kind, store: storeLabel(l.store), destination, takenBy: l.takenBy, recipient: l.recipient?.name, dates: [], users: new Set(), lines: [] })
    }
    const group = groups.get(key)
    group.dates.push(l.entryDate)
    if (l.user) group.users.add(l.user.username)
    group.lines.push({
      product: l.product.name,
      owner: ownerLabel(l.owner),
      unit: l.product.unit.name,
      quantity: l.quantity,
      rate: l.rate,
      amount: l.quantity * l.rate,
    })
  }

  return [...groups.values()].map((g, i) => {
    const type = NOTE_TYPES[g.kind]
    const users = [...g.users].join(", ")
    const date = dateRange(g.dates)

    const meta = [["Ref no.", refNo], ["Date", date]]
    if (g.kind === "RECEIPT") meta.push(["Received into", g.store])
    else meta.push(["From", g.store], [g.kind === "FIELD" ? "Project" : g.kind === "EXTERNAL" ? "Issued to" : "To", g.destination])
    if (g.takenBy) meta.push(["Taken by", g.takenBy])
    if (users) meta.push(["Recorded by", users])

    const names = {
      "Received by": g.kind === "RECEIPT" ? users : g.kind === "EXTERNAL" ? g.takenBy || g.recipient : "",
      "Issued by": users,
      "Dispatched by": users,
      "Taken by": g.takenBy ?? "",
    }

    return {
      id: `${g.kind}-${i}`,
      kind: g.kind,
      title: type.title,
      subtitle: type.subtitle ?? null,
      refNo,
      date,
      meta,
      lines: g.lines,
      total: g.lines.reduce((s, line) => s + line.amount, 0),
      signatures: type.signatures.map(label => ({ label, name: names[label] || "" })),
    }
  })
}
