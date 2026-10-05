import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth"
import { json, fail, handleError, httpError } from "@/lib/http"

const CHANGED = "The stock changed while this was being saved. Reload the page and try again."

// POST /api/items/:id/release  (Admin)
// Body: { quantity }. Moves stock kept for a project (e.g. leftovers when it ends) onto the general
// row of the same store, so it can be issued anywhere. Recorded as a pair of adjustments.
export async function POST(req, { params }) {
  const { id } = await params
  try {
    const user = await requireAdmin()
    const { quantity } = await req.json()
    if (!Number.isFinite(quantity) || quantity <= 0) return fail("Enter a quantity greater than 0")

    const entry = await prisma.stockEntry.findUnique({
      where: { id },
      include: {
        forProject: { select: { name: true } },
        product: { select: { name: true } },
        store: { include: { category: { select: { trackLogs: true, isSystem: true } } } },
      },
    })
    if (!entry || entry.store.category.isSystem) return fail("Item not found", 404)
    if (!entry.forProjectId) return fail("This stock isn't kept for a project")
    if (entry.isDeleted) return fail("This item has been removed. Restore it first.")
    if (quantity - entry.quantity > 1e-9) return fail(`Only ${entry.quantity} of ${entry.product.name} is kept for ${entry.forProject.name}`, 422)

    const userId = entry.store.category.trackLogs ? user.id : null
    const left = Math.abs(entry.quantity - quantity) < 1e-9 ? 0 : Number((entry.quantity - quantity).toPrecision(12))
    await prisma.$transaction(async tx => {
      const { count } = await tx.stockEntry.updateMany({ where: { id, quantity: entry.quantity, isDeleted: false }, data: { quantity: left } })
      if (count !== 1) throw httpError(CHANGED, 409)

      const general = { storeId: entry.storeId, productId: entry.productId, ownerId: entry.ownerId, forProjectId: null }
      const row = await tx.stockEntry.findFirst({ where: general })
      if (row && !row.isDeleted) {
        await tx.stockEntry.update({ where: { id: row.id }, data: { quantity: { increment: quantity } } })
      } else {
        if (row) await tx.stockEntry.delete({ where: { id: row.id } })
        await tx.stockEntry.create({ data: { ...general, rate: entry.rate, quantity } })
      }

      const shared = { storeId: entry.storeId, productId: entry.productId, ownerId: entry.ownerId, type: "RELEASE", quantity, rate: entry.rate, userId }
      await tx.stockLog.createMany({
        data: [
          { ...shared, forProjectId: entry.forProjectId, adjustment: -quantity, note: `Released to general stock (was kept for ${entry.forProject.name})` },
          { ...shared, forProjectId: null, adjustment: quantity, note: `Released from project ${entry.forProject.name}` },
        ],
      })
    }, { timeout: 20000 })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "The stock could not be released. No changes were made.", { P2002: CHANGED })
  }
}
