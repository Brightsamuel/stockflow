import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"

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
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
    return NextResponse.json(transfers)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch transfers" }, { status: 500 })
  }
}

export async function POST(req) {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
  }

  try {
    const { sourceStoreId, targetStoreId, recipientId, productId, quantity } = await req.json()

    if (!sourceStoreId || !productId || quantity == null)
      return NextResponse.json({ error: "All fields required" }, { status: 400 })
    if (quantity <= 0)
      return NextResponse.json({ error: "Quantity must be > 0" }, { status: 400 })
    if (!targetStoreId && !recipientId)
      return NextResponse.json({ error: "Select a destination store or an external recipient" }, { status: 400 })
    if (targetStoreId && recipientId)
      return NextResponse.json({ error: "Choose either a store or a recipient, not both" }, { status: 400 })
    if (targetStoreId && sourceStoreId === targetStoreId)
      return NextResponse.json({ error: "Source and target cannot be the same" }, { status: 400 })

    const sourceEntry = await prisma.stockEntry.findUnique({
      where: { productId_storeId: { productId, storeId: sourceStoreId } },
    })
    if (!sourceEntry)
      return NextResponse.json({ error: "Product not found in source store" }, { status: 404 })
    if (sourceEntry.quantity < quantity)
      return NextResponse.json(
        { error: `Not enough stock. Available: ${sourceEntry.quantity}` },
        { status: 422 }
      )

    const sourceStore = await prisma.store.findUnique({
      where: { id: sourceStoreId },
      include: { category: { select: { trackLogs: true } } },
    })
    if (!sourceStore)
      return NextResponse.json({ error: "Source store not found" }, { status: 404 })

    const sourceLogUserId = sourceStore.category.trackLogs ? user.id : null

    // ── External transfer path ──────────────────────────────────────────────
    if (recipientId) {
      const recipient = await prisma.recipient.findUnique({ where: { id: recipientId } })
      if (!recipient)
        return NextResponse.json({ error: "Recipient not found" }, { status: 404 })

      const result = await prisma.$transaction(async (tx) => {
        await tx.stockEntry.update({
          where: { id: sourceEntry.id },
          data: { quantity: { decrement: quantity } },
        })

        const transfer = await tx.transfer.create({
          data: { sourceStoreId, recipientId, productId, quantity, userId: sourceLogUserId },
          include: {
            product: { include: { unit: true } },
            sourceStore: { select: { id: true, name: true, category: { select: { name: true } } } },
            recipient: { select: { id: true, name: true, company: true } },
          },
        })

        await tx.stockLog.create({
          data: {
            storeId: sourceStoreId,
            productId,
            type: "TRANSFER_OUT",
            quantity,
            rate: sourceEntry.rate,
            note: `Issued to ${recipient.name}${recipient.company ? ` (${recipient.company})` : ""}`,
            userId: sourceLogUserId,
            recipientId,
          },
        })

        return transfer
      })

      return NextResponse.json(result, { status: 201 })
    }

    // ── Store-to-store path (unchanged behavior) ────────────────────────────
    const targetStore = await prisma.store.findUnique({
      where: { id: targetStoreId },
      include: { category: { select: { trackLogs: true } } },
    })
    if (!targetStore)
      return NextResponse.json({ error: "Target store not found" }, { status: 404 })

    const targetLogUserId = targetStore.category.trackLogs ? user.id : null

    const result = await prisma.$transaction(async (tx) => {
      await tx.stockEntry.update({
        where: { id: sourceEntry.id },
        data: { quantity: { decrement: quantity } },
      })

      const existingTarget = await tx.stockEntry.findUnique({
        where: { productId_storeId: { productId, storeId: targetStoreId } },
      })

      if (existingTarget) {
        await tx.stockEntry.update({
          where: { id: existingTarget.id },
          data: { quantity: { increment: quantity } },
        })
      } else {
        await tx.stockEntry.create({
          data: { productId, storeId: targetStoreId, rate: 0, quantity },
        })
      }

      const transfer = await tx.transfer.create({
        data: {
          sourceStoreId, targetStoreId, productId, quantity,
          userId: (sourceLogUserId || targetLogUserId) ? user.id : null,
        },
        include: {
          product: { include: { unit: true } },
          sourceStore: { select: { id: true, name: true, category: { select: { name: true } } } },
          targetStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        },
      })

      await tx.stockLog.create({
        data: {
          storeId: sourceStoreId, productId, type: "TRANSFER_OUT", quantity,
          rate: sourceEntry.rate, note: `Transferred to ${targetStore.name}`,
          userId: sourceLogUserId,
        },
      })
      await tx.stockLog.create({
        data: {
          storeId: targetStoreId, productId, type: "TRANSFER_IN", quantity,
          rate: sourceEntry.rate, note: `Received from ${sourceStore.name}`,
          userId: targetLogUserId,
        },
      })

      return transfer
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Transfer failed. No changes were made." }, { status: 500 })
  }
}