import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { PRODUCT_WITH_BALANCES, parseAmount, setOpeningBalance } from "@/lib/openingBalance"

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        entries: { select: { id: true, storeId: true, store: { select: { category: { select: { isSystem: true } } } } } },
        _count: { select: { transfers: true } },
      },
    })
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    const openingEntries = product.entries.filter(e => e.store.category.isSystem)
    if (product.entries.length > openingEntries.length)
      return NextResponse.json(
        { error: "Cannot delete — product exists in store inventories" },
        { status: 400 }
      )
    if (product._count.transfers > 0)
      return NextResponse.json(
        { error: "Cannot delete — stock of this product has already been issued" },
        { status: 400 }
      )

    // Only an unissued opening balance is left; remove it along with the product
    await prisma.$transaction(async (tx) => {
      for (const entry of openingEntries) {
        await tx.stockLog.deleteMany({ where: { productId: id, storeId: entry.storeId } })
        await tx.stockEntry.delete({ where: { id: entry.id } })
      }
      await tx.product.delete({ where: { id } })
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 })
  }
}

export async function PATCH(req, { params }) {
  const { id } = await params
  let user
  try {
    user = await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const body = await req.json()
    const { name, unitId } = body
    const openingQty = parseAmount(body.openingQty, "Opening qty")
    const openingRate = parseAmount(body.openingRate, "Rate")

    const data = {}
    if (name?.trim()) data.name = name.trim()
    if (unitId) data.unitId = unitId
    const changesOpening = openingQty !== undefined || openingRate !== undefined
    if (!Object.keys(data).length && !changesOpening)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN"
    if (changesOpening && !isAdmin)
      return NextResponse.json({ error: "Only admins can change the opening balance" }, { status: 403 })

    const product = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } })
      if (!existing) {
        const err = new Error("Product not found")
        err.status = 404
        throw err
      }
      if (Object.keys(data).length) await tx.product.update({ where: { id }, data })
      if (changesOpening)
        await setOpeningBalance(
          tx, id,
          openingQty ?? existing.openingQty,
          openingRate ?? existing.openingRate,
          user.id,
        )
      return tx.product.findUnique({ where: { id }, include: PRODUCT_WITH_BALANCES })
    })
    return NextResponse.json(product)
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Product name already exists" }, { status: 409 })
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 })
  }
}
