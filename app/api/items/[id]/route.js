import prisma from "@/lib/prisma"
import { requireEditor, requireSuperAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

// A store row plus what the checks below need; opening-balance rows are managed from Products
async function findEntry(id) {
  return prisma.stockEntry.findUnique({
    where: { id },
    include: { store: { include: { category: { select: { trackLogs: true, isSystem: true } } } } },
  })
}

// Body: { rate?, quantity?, lowStockAt? }. A quantity change is logged as an adjustment.
export async function PUT(req, { params }) {
  const { id } = await params
  try {
    const user = await requireEditor()
    const body = await req.json()
    const data = {}
    for (const field of ["rate", "quantity", "lowStockAt"]) {
      if (body[field] == null) continue
      const value = Number(body[field])
      if (!Number.isFinite(value) || value < 0) return fail(`${field === "lowStockAt" ? "Low stock alert" : field[0].toUpperCase() + field.slice(1)} must be 0 or greater`)
      data[field] = value
    }
    if (!Object.keys(data).length) return fail("Nothing to update")

    const existing = await findEntry(id)
    if (!existing || existing.store.category.isSystem) return fail("Item not found", 404)
    if (existing.isDeleted) return fail("This item has been removed. Restore it first.")

    const changes = []
    if (data.rate != null && data.rate !== existing.rate) changes.push(`rate ${existing.rate} → ${data.rate}`)
    if (data.quantity != null && data.quantity !== existing.quantity) changes.push(`quantity ${existing.quantity} → ${data.quantity}`)
    if (data.lowStockAt != null && data.lowStockAt !== existing.lowStockAt) changes.push(`low stock alert ${existing.lowStockAt} → ${data.lowStockAt}`)
    if (!changes.length) return json({ ...existing, price: existing.rate * existing.quantity })

    const adjustment = data.quantity != null ? data.quantity - existing.quantity : 0
    const entry = await prisma.$transaction(async tx => {
      const updated = await tx.stockEntry.update({ where: { id }, data })
      await tx.stockLog.create({
        data: {
          storeId: existing.storeId,
          productId: existing.productId,
          ownerId: existing.ownerId,
          forProjectId: existing.forProjectId,
          type: "EDIT",
          quantity: updated.quantity,
          rate: updated.rate,
          adjustment: adjustment || null,
          note: changes.join(", "),
          userId: existing.store.category.trackLogs ? user.id : null,
        },
      })
      return updated
    })
    return json({ ...entry, price: entry.rate * entry.quantity })
  } catch (e) {
    return handleError(e, "Failed to update the item", { P2025: "Item not found" })
  }
}

// Removes the item from the store (Super admin). It can be restored; its history is kept.
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    const user = await requireSuperAdmin()
    const existing = await findEntry(id)
    if (!existing || existing.store.category.isSystem) return fail("Item not found", 404)
    if (existing.isDeleted) return fail("This item has already been removed")

    await prisma.$transaction(async tx => {
      await tx.stockLog.create({
        data: {
          storeId: existing.storeId,
          productId: existing.productId,
          ownerId: existing.ownerId,
          forProjectId: existing.forProjectId,
          type: "DELETE",
          quantity: existing.quantity,
          rate: existing.rate,
          adjustment: -existing.quantity,
          note: `Removed from the store (was ${existing.quantity} @ ${existing.rate})`,
          userId: existing.store.category.trackLogs ? user.id : null,
        },
      })
      await tx.stockEntry.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } })
    })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to remove the item")
  }
}
