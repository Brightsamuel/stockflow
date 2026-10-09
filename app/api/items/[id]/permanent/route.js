import prisma from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth"
import { json, handleError } from "@/lib/http"
import { eraseRemovedItem } from "@/lib/deletions"

const PRISMA_MESSAGES = { P2002: "The stock changed while this was being saved. Reload the page and try again." }

// GET /api/items/:id/permanent  (Super admin): what deleting this removed item for good would do.
// When its row holds only received stock and store corrections, its whole history goes with it
// (kept under Documents → Deleted and restorable); otherwise only the row goes and the history stays.
export async function GET(req, { params }) {
  const { id } = await params
  try {
    const user = await requireSuperAdmin()
    return json(await eraseRemovedItem(prisma, { entryId: id, user, preview: true }))
  } catch (e) {
    return handleError(e, "Failed to check the item")
  }
}

// DELETE /api/items/:id/permanent  (Super admin). Body: { reason } (needed when the history goes too)
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    const user = await requireSuperAdmin()
    const { reason } = await req.json().catch(() => ({}))
    const result = await prisma.$transaction(tx => eraseRemovedItem(tx, { entryId: id, reason, user }), { timeout: 20000 })
    return json({ success: true, ...result })
  } catch (e) {
    return handleError(e, "Failed to delete the item. No changes were made.", PRISMA_MESSAGES)
  }
}
