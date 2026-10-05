import prisma from "@/lib/prisma"
import { requireEditor } from "@/lib/auth"
import { json, fail, handleError, httpError } from "@/lib/http"
import { isAdminRole } from "@/lib/constants"
import { productHistory } from "@/lib/guards"
import { PRODUCT_WITH_BALANCES, parseAmount, setOpeningBalance } from "@/lib/openingBalance"

// A product can only be deleted while nothing has happened to it beyond an unissued opening balance
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireEditor()
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        entries: { select: { id: true, storeId: true, store: { select: { category: { select: { isSystem: true } } } } } },
        _count: { select: { transfers: true } },
      },
    })
    if (!product) return fail("Product not found", 404)

    const openingEntries = product.entries.filter(e => e.store.category.isSystem)
    if (product.entries.length > openingEntries.length)
      return fail("This product is held in store inventories, so it can't be deleted", 409)
    if (product._count.transfers > 0)
      return fail("Stock of this product has already been issued, so it can't be deleted", 409)
    if ((await productHistory(prisma, id)) > 0) return fail("This product has movement history, so it can't be deleted", 409)

    // Only an unissued opening balance is left; remove it along with the product
    await prisma.$transaction(async tx => {
      for (const entry of openingEntries) {
        await tx.stockLog.deleteMany({ where: { productId: id, storeId: entry.storeId } })
        await tx.stockEntry.delete({ where: { id: entry.id } })
      }
      await tx.product.delete({ where: { id } })
    })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete product")
  }
}

// Body: { name?, unitId?, openingQty?, openingRate? } — the opening balance is admin-only
export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    const user = await requireEditor()
    const body = await req.json()
    const openingQty = parseAmount(body.openingQty, "Opening qty")
    const openingRate = parseAmount(body.openingRate, "Rate")

    const data = {}
    if (body.name?.trim()) data.name = body.name.trim()
    if (body.unitId) data.unitId = body.unitId
    const changesOpening = openingQty !== undefined || openingRate !== undefined
    if (!Object.keys(data).length && !changesOpening) return fail("Nothing to update")
    if (changesOpening && !isAdminRole(user.role)) return fail("Only an admin can change the opening balance", 403)

    const product = await prisma.$transaction(async tx => {
      const existing = await tx.product.findUnique({ where: { id } })
      if (!existing) throw httpError("Product not found", 404)
      if (Object.keys(data).length) await tx.product.update({ where: { id }, data })
      if (changesOpening)
        await setOpeningBalance(tx, id, openingQty ?? existing.openingQty, openingRate ?? existing.openingRate, user.id)
      return tx.product.findUnique({ where: { id }, include: PRODUCT_WITH_BALANCES })
    })
    return json(product)
  } catch (e) {
    return handleError(e, "Failed to update product", { P2002: "A product with that name already exists" })
  }
}
