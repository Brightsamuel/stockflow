import prisma from "@/lib/prisma"
import { requireUser } from "@/lib/auth"
import { json, fail, handleError, parseEntryDate } from "@/lib/http"
import { applyStockMove } from "@/lib/stockMove"

export async function GET(req) {
  try {
    await requireUser()
    const storeId = new URL(req.url).searchParams.get("storeId")
    const transfers = await prisma.transfer.findMany({
      where: storeId ? { OR: [{ sourceStoreId: storeId }, { targetStoreId: storeId }] } : undefined,
      include: {
        product: { include: { unit: true } },
        sourceStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        targetStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        recipient: { select: { id: true, name: true, company: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
    return json(transfers)
  } catch (e) {
    return handleError(e, "Failed to load stock movements")
  }
}

// POST /api/transfers
// Body: { sourceStoreId, targetStoreId | projectId | recipientId, takenBy?, refNo?, entryDate?, items: [{ entryId, quantity }] }
// targetStoreId = transfer between stores; projectId / recipientId = stock out (leaves the inventory as used/issued).
// A stock out to a project must say who is taking it to the field (takenBy).
export async function POST(req) {
  try {
    const user = await requireUser()
    const { sourceStoreId, targetStoreId, projectId, recipientId, takenBy, refNo, entryDate, items } = await req.json()

    if (!sourceStoreId) return fail("Source store required")
    if ([targetStoreId, projectId, recipientId].filter(Boolean).length !== 1)
      return fail("Choose one destination: a store, a project or an external party")
    if (targetStoreId && targetStoreId === sourceStoreId) return fail("Source and destination cannot be the same store")
    const taker = projectId ? takenBy?.trim() || null : null
    if (projectId && !taker) return fail("Enter who is taking the stock to the project (Taken by)")
    if (!Array.isArray(items) || items.length === 0) return fail("Add at least one item")
    for (const [i, item] of items.entries()) {
      if (!item.entryId || !Number.isFinite(item.quantity) || item.quantity <= 0)
        return fail(`Line ${i + 1}: select an item and enter a quantity greater than 0`)
    }
    const date = parseEntryDate(entryDate)

    const sourceStore = await prisma.store.findUnique({
      where: { id: sourceStoreId },
      include: { category: { select: { trackLogs: true } } },
    })
    if (!sourceStore) return fail("Source store not found", 404)
    const sourceUserId = sourceStore.category.trackLogs ? user.id : null

    let outNote, inNote, targetUserId = null
    if (targetStoreId) {
      const targetStore = await prisma.store.findUnique({
        where: { id: targetStoreId },
        include: { category: { select: { trackLogs: true, isSystem: true } } },
      })
      if (!targetStore || targetStore.category.isSystem) return fail("Destination store not found", 404)
      targetUserId = targetStore.category.trackLogs ? user.id : null
      outNote = `Transferred to ${targetStore.name}`
      inNote = `Received from ${sourceStore.name}`
    } else if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) return fail("Project not found", 404)
      outNote = `Used on project ${project.name}`
    } else {
      const recipient = await prisma.recipient.findUnique({ where: { id: recipientId } })
      if (!recipient) return fail("Recipient not found", 404)
      outNote = `Issued to ${recipient.name}${recipient.company ? ` (${recipient.company})` : ""}`
    }
    if (taker) outNote += ` · taken by ${taker}`

    const ref = refNo?.trim() || null
    const count = await prisma.$transaction(
      tx => applyStockMove(tx, {
        sourceStoreId,
        targetStoreId: targetStoreId || null,
        projectId: projectId || null,
        recipientId: recipientId || null,
        takenBy: taker,
        items,
        refNo: ref,
        entryDate: date,
        outNote,
        inNote,
        sourceUserId,
        targetUserId,
        transferUserId: sourceUserId || targetUserId ? user.id : null,
      }),
      { timeout: 20000 },
    )
    return json({ count, refNo: ref }, 201)
  } catch (e) {
    return handleError(e, "Stock movement failed. No changes were made.")
  }
}
