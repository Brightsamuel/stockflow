import prisma from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

// Puts a removed item back into its store with the quantity it had
export async function POST(req, { params }) {
  const { id } = await params
  try {
    const user = await requireSuperAdmin()
    const existing = await prisma.stockEntry.findUnique({
      where: { id },
      include: { store: { include: { category: { select: { trackLogs: true, isSystem: true } } } } },
    })
    if (!existing || existing.store.category.isSystem) return fail("Item not found", 404)
    if (!existing.isDeleted) return fail("This item hasn't been removed")

    const entry = await prisma.$transaction(async tx => {
      const restored = await tx.stockEntry.update({ where: { id }, data: { isDeleted: false, deletedAt: null } })
      await tx.stockLog.create({
        data: {
          storeId: existing.storeId,
          productId: existing.productId,
          ownerId: existing.ownerId,
          forProjectId: existing.forProjectId,
          type: "RESTORE",
          quantity: restored.quantity,
          rate: restored.rate,
          adjustment: restored.quantity,
          note: "Restored to the store",
          userId: existing.store.category.trackLogs ? user.id : null,
        },
      })
      return restored
    })
    return json(entry)
  } catch (e) {
    return handleError(e, "Failed to restore the item")
  }
}
