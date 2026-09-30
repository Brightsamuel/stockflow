import prisma from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

// Deletes a removed item's row for good (Super admin). Its movement history is kept:
// the logs belong to the product and store, not to this row.
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireSuperAdmin()
    const existing = await prisma.stockEntry.findUnique({
      where: { id },
      include: { store: { select: { category: { select: { isSystem: true } } } } },
    })
    if (!existing || existing.store.category.isSystem) return fail("Item not found", 404)
    if (!existing.isDeleted) return fail("Remove the item from the store first")

    await prisma.stockEntry.delete({ where: { id } })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete the item")
  }
}
