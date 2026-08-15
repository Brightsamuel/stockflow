import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"

export async function POST(req, { params }) {
  const { id } = await params
  let user
  try {
    user = await requireSuperAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 403 })
  }

  try {
    const existing = await prisma.stockEntry.findUnique({
      where: { id },
      include: { store: { include: { category: { select: { trackLogs: true } } } } },
    })
    if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    if (!existing.isDeleted) return NextResponse.json({ error: "Entry is not deleted" }, { status: 400 })

    const logUserId = existing.store.category.trackLogs ? user.id : null

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.stockEntry.update({
        where: { id },
        data: { isDeleted: false, deletedAt: null },
      })
      await tx.stockLog.create({
        data: {
          storeId: existing.storeId,
          productId: existing.productId,
          type: "RESTORE",
          quantity: entry.quantity,
          rate: entry.rate,
          note: "Entry restored",
          userId: logUserId,
        },
      })
      return entry
    })

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: "Failed to restore" }, { status: 500 })
  }
}