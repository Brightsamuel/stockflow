import prisma from "@/lib/prisma"
import { requireEditor, requireUser } from "@/lib/auth"
import { json, fail, handleError, parseEntryDate, personName } from "@/lib/http"
import { applyStockMove } from "@/lib/stockMove"
import { recentStockMove, savedAgo } from "@/lib/duplicates"

export async function GET(req) {
  try {
    await requireUser()
    const storeId = new URL(req.url).searchParams.get("storeId")
    const transfers = await prisma.transfer.findMany({
      where: { deletionId: null, ...(storeId && { OR: [{ sourceStoreId: storeId }, { targetStoreId: storeId }] }) },
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
// Body: { sourceStoreId, targetStoreId | projectId | recipientId, takenBy?, issuedBy?, receivedBy?, refNo?, entryDate?,
//         items: [{ entryId, quantity }], ownerId? }   (issuedBy / receivedBy: names typed for the note's signature blocks)
// ownerId: only when issuing opening stock to a store, the owner the stock belongs to there.
// targetStoreId = transfer between stores; projectId / recipientId = stock out (leaves the inventory as used/issued).
// A stock out to a project must say who is taking it to the field (takenBy).
// The same movement saved again within a few minutes returns 409 { duplicate: true } unless
// confirmDuplicate is set (e.g. an opening balance issued twice by mistake).
export async function POST(req) {
  try {
    const user = await requireEditor()
    const { sourceStoreId, targetStoreId, projectId, recipientId, takenBy, issuedBy, receivedBy, refNo, entryDate, items, ownerId, confirmDuplicate } = await req.json()
    const names = {
      handedOverBy: personName(issuedBy, targetStoreId ? "Dispatched by" : "Issued by"),
      // A project's stock is received by whoever takes it (Taken by)
      receivedBy: projectId ? null : personName(receivedBy, "Received by"),
    }

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
      include: { category: { select: { trackLogs: true, isSystem: true } } },
    })
    if (!sourceStore) return fail("Source store not found", 404)
    // An opening balance issued to a store becomes that store's opening stock
    const openingStock = sourceStore.category.isSystem && Boolean(targetStoreId)
    const sourceUserId = sourceStore.category.trackLogs ? user.id : null

    // Opening stock has no owner until it is issued to a store; the owner is chosen then
    let targetOwnerId = null
    if (ownerId) {
      if (!openingStock) return fail("A stock owner can only be chosen when issuing opening stock to a store")
      if (!(await prisma.stockOwner.findUnique({ where: { id: ownerId }, select: { id: true } }))) return fail("Stock owner not found", 404)
      targetOwnerId = ownerId
    }

    let outNote, inNote, targetUserId = null
    if (targetStoreId) {
      const targetStore = await prisma.store.findUnique({
        where: { id: targetStoreId },
        include: { category: { select: { trackLogs: true, isSystem: true } } },
      })
      if (!targetStore || targetStore.category.isSystem) return fail("Destination store not found", 404)
      targetUserId = targetStore.category.trackLogs ? user.id : null
      outNote = openingStock ? `Opening stock issued to ${targetStore.name}` : `Transferred to ${targetStore.name}`
      inNote = openingStock ? "Opening stock, from the opening balance" : `Received from ${sourceStore.name}`
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
    if (!confirmDuplicate) {
      const entries = await prisma.stockEntry.findMany({
        where: { id: { in: items.map(i => i.entryId) } },
        select: { id: true, productId: true, ownerId: true },
      })
      const byId = new Map(entries.map(e => [e.id, e]))
      const earlier = entries.length === new Set(items.map(i => i.entryId)).size && await recentStockMove(prisma, {
        sourceStoreId,
        targetStoreId: targetStoreId || null,
        projectId: projectId || null,
        recipientId: recipientId || null,
        lines: items.map(i => ({ productId: byId.get(i.entryId).productId, ownerId: byId.get(i.entryId).ownerId, quantity: i.quantity })),
      })
      if (earlier) {
        const what = targetStoreId ? "transfer" : "stock out"
        return json({
          duplicate: true,
          error: `The same ${what} from ${sourceStore.name} was saved ${savedAgo(earlier)}. Saving again moves the stock a second time.`,
        }, 409)
      }
    }

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
        ...names,
        openingStock,
        targetOwnerId,
      }),
      { timeout: 20000 },
    )
    return json({ count, refNo: ref }, 201)
  } catch (e) {
    return handleError(e, "Stock movement failed. No changes were made.")
  }
}
