import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { applyStockMove } from "@/lib/stockMove"

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const transfers = await prisma.transfer.findMany({
      where: storeId
        ? { OR: [{ sourceStoreId: storeId }, { targetStoreId: storeId }] }
        : undefined,
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
    return NextResponse.json(transfers)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch transfers" }, { status: 500 })
  }
}

// POST /api/transfers
// Body: { sourceStoreId, targetStoreId | projectId | recipientId, refNo?, entryDate?, items: [{ entryId, quantity }] }
// targetStoreId = transfer between stores; projectId / recipientId = stock out (leaves the inventory as used/issued)
export async function POST(req) {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
  }

  try {
    const { sourceStoreId, targetStoreId, projectId, recipientId, refNo, entryDate, items } = await req.json()

    if (!sourceStoreId)
      return NextResponse.json({ error: "Source store required" }, { status: 400 })
    const destinations = [targetStoreId, projectId, recipientId].filter(Boolean)
    if (destinations.length !== 1)
      return NextResponse.json({ error: "Choose one destination: a store, a project or an external party" }, { status: 400 })
    if (targetStoreId && targetStoreId === sourceStoreId)
      return NextResponse.json({ error: "Source and target cannot be the same" }, { status: 400 })
    if (!Array.isArray(items) || items.length === 0)
      return NextResponse.json({ error: "Add at least one item" }, { status: 400 })
    for (const [i, item] of items.entries()) {
      if (!item.entryId || !Number.isFinite(item.quantity) || item.quantity <= 0)
        return NextResponse.json({ error: `Line ${i + 1}: select an item and enter a quantity greater than 0` }, { status: 400 })
    }

    let parsedDate = entryDate ? new Date(entryDate) : new Date()
    if (isNaN(parsedDate)) parsedDate = new Date()
    if (parsedDate > new Date())
      return NextResponse.json({ error: "Date cannot be in the future" }, { status: 400 })

    const sourceStore = await prisma.store.findUnique({
      where: { id: sourceStoreId },
      include: { category: { select: { trackLogs: true } } },
    })
    if (!sourceStore)
      return NextResponse.json({ error: "Source store not found" }, { status: 404 })
    const sourceUserId = sourceStore.category.trackLogs ? user.id : null

    let outNote, inNote, targetUserId = null
    if (targetStoreId) {
      const targetStore = await prisma.store.findUnique({
        where: { id: targetStoreId },
        include: { category: { select: { trackLogs: true, isSystem: true } } },
      })
      if (!targetStore || targetStore.category.isSystem)
        return NextResponse.json({ error: "Target store not found" }, { status: 404 })
      targetUserId = targetStore.category.trackLogs ? user.id : null
      outNote = `Transferred to ${targetStore.name}`
      inNote = `Received from ${sourceStore.name}`
    } else if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project)
        return NextResponse.json({ error: "Project not found" }, { status: 404 })
      outNote = `Used on project ${project.name}`
    } else {
      const recipient = await prisma.recipient.findUnique({ where: { id: recipientId } })
      if (!recipient)
        return NextResponse.json({ error: "Recipient not found" }, { status: 404 })
      outNote = `Issued to ${recipient.name}${recipient.company ? ` (${recipient.company})` : ""}`
    }

    const ref = refNo?.trim() || null
    const count = await prisma.$transaction(
      tx => applyStockMove(tx, {
        sourceStoreId,
        targetStoreId: targetStoreId || null,
        projectId: projectId || null,
        recipientId: recipientId || null,
        items,
        refNo: ref,
        entryDate: parsedDate,
        outNote,
        inNote,
        sourceUserId,
        targetUserId,
        transferUserId: (sourceUserId || targetUserId) ? user.id : null,
      }),
      { timeout: 20000 },
    )

    return NextResponse.json({ count, refNo: ref }, { status: 201 })
  } catch (e) {
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: "Stock movement failed. No changes were made." }, { status: 500 })
  }
}
