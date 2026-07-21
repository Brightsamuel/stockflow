import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const sourceStoreId = searchParams.get("sourceStoreId")
    const targetStoreId = searchParams.get("targetStoreId")
    const storeId = searchParams.get("storeId") // either side

    const transfers = await prisma.transfer.findMany({
      where: storeId
        ? { OR: [{ sourceStoreId: storeId }, { targetStoreId: storeId }] }
        : {
            ...(sourceStoreId && { sourceStoreId }),
            ...(targetStoreId && { targetStoreId }),
          },
      include: {
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
    const { sourceStoreId, targetStoreId, sourceItemId, quantity } = await req.json()

    if (!sourceStoreId || !targetStoreId || !sourceItemId || quantity == null)
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    if (quantity <= 0)
      return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 })
    if (sourceStoreId === targetStoreId)
      return NextResponse.json({ error: "Source and target cannot be the same store" }, { status: 400 })

    const sourceItem = await prisma.item.findUnique({
      where: { id: sourceItemId },
      include: { store: { select: { name: true } } },
    })
    if (!sourceItem) return NextResponse.json({ error: "Source item not found" }, { status: 404 })
    if (sourceItem.storeId !== sourceStoreId)
      return NextResponse.json({ error: "Item does not belong to source store" }, { status: 400 })
    if (sourceItem.quantity < quantity)
      return NextResponse.json({
        error: `Not enough stock. Available: ${sourceItem.quantity} ${sourceItem.unit}`,
      }, { status: 422 })

    const targetStore = await prisma.store.findUnique({ where: { id: targetStoreId } })
    if (!targetStore) return NextResponse.json({ error: "Target store not found" }, { status: 404 })

    const result = await prisma.$transaction(async (tx) => {
      const updatedSource = await tx.item.update({
        where: { id: sourceItemId },
        data: { quantity: { decrement: quantity } },
      })

      const existingTarget = await tx.item.findUnique({
        where: { name_storeId: { name: sourceItem.name, storeId: targetStoreId } },
      })

      const targetItem = existingTarget
        ? await tx.item.update({
            where: { id: existingTarget.id },
            data: { quantity: { increment: quantity } },
          })
        : await tx.item.create({
            data: {
              name: sourceItem.name,
              unit: sourceItem.unit,
              rate: sourceItem.rate,
              quantity,
              lowStockAt: sourceItem.lowStockAt,
              storeId: targetStoreId,
            },
          })

      const transfer = await tx.transfer.create({
        data: {
          sourceStoreId,
          targetStoreId,
          sourceItemId,
          itemName: sourceItem.name,
          unit: sourceItem.unit,
          rate: sourceItem.rate,
          quantity,
        },
        include: {
          sourceStore: { select: { id: true, name: true, category: { select: { name: true } } } },
          targetStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        },
      })

      return { transfer, sourceItem: updatedSource, targetItem }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Transfer failed. No changes were made." }, { status: 500 })
  }
}