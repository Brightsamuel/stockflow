import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

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
  try {
    const { sourceStoreId, targetStoreId, productId, quantity } = await req.json()

    if (!sourceStoreId || !targetStoreId || !productId || quantity == null)
      return NextResponse.json({ error: "All fields required" }, { status: 400 })
    if (quantity <= 0)
      return NextResponse.json({ error: "Quantity must be > 0" }, { status: 400 })
    if (sourceStoreId === targetStoreId)
      return NextResponse.json({ error: "Source and target cannot be the same" }, { status: 400 })

    // Check source has enough stock
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

    const [sourceStore, targetStore] = await Promise.all([
      prisma.store.findUnique({ where: { id: sourceStoreId } }),
      prisma.store.findUnique({ where: { id: targetStoreId } }),
    ])
    if (!sourceStore)
      return NextResponse.json({ error: "Source store not found" }, { status: 404 })
    if (!targetStore)
      return NextResponse.json({ error: "Target store not found" }, { status: 404 })

    const result = await prisma.$transaction(async (tx) => {
      // Reduce source
      await tx.stockEntry.update({
        where: { id: sourceEntry.id },
        data: { quantity: { decrement: quantity } },
      })

      // Increase or create target entry
      // Rate is NOT transferred — target keeps its own rate or starts at 0
      const existingTarget = await tx.stockEntry.findUnique({
        where: { productId_storeId: { productId, storeId: targetStoreId } },
      })

      if (existingTarget) {
        await tx.stockEntry.update({
          where: { id: existingTarget.id },
          data: { quantity: { increment: quantity } },
        })
      } else {
        // New entry in target — rate is 0 until they do a stock-in with a price
        await tx.stockEntry.create({
          data: { productId, storeId: targetStoreId, rate: 0, quantity },
        })
      }

      // Record the transfer
      const transfer = await tx.transfer.create({
        data: { sourceStoreId, targetStoreId, productId, quantity },
        include: {
          product: { include: { unit: true } },
          sourceStore: { select: { id: true, name: true, category: { select: { name: true } } } },
          targetStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        },
      })

      // Log both sides
      await tx.stockLog.create({
        data: {
          storeId: sourceStoreId,
          productId,
          type: "TRANSFER_OUT",
          quantity,
          rate: sourceEntry.rate,
          note: `Transferred to ${targetStore.name}`,
        },
      })
      await tx.stockLog.create({
        data: {
          storeId: targetStoreId,
          productId,
          type: "TRANSFER_IN",
          quantity,
          rate: sourceEntry.rate, // snapshot of source rate for reference
          note: `Received from ${sourceStore.name}`,
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