import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { editReceipt } from "@/lib/noteEdits"

const PRISMA_MESSAGES = { P2002: "The stock changed while this was being saved. Reload the page and try again." }

// POST /api/notes/edit  (Admins and Super admins)
// Body: { refNo | logId, documentId, changed: [{ logId, quantity, rate }], removed: [logId],
//         added: [{ productId, quantity, rate, ownerId? }], reason, preview? }
// Corrects a Goods Received Note: the stock moves by the difference and the note shows the edit.
// preview: only report what it would do to each store row and anything that blocks it.
export async function POST(req) {
  try {
    const user = await requireAdmin()
    const { refNo, logId, documentId, changed, removed, added, reason, preview } = await req.json()
    const ref = typeof refNo === "string" ? refNo.trim() : ""
    if ((!ref && !logId) || !documentId) return fail("Choose the note to edit")

    const args = { refNo: ref || null, logId: ref ? null : logId, documentId, changed, removed, added, reason, user }
    if (preview) return json(await editReceipt(prisma, { ...args, preview: true }))
    const result = await prisma.$transaction(tx => editReceipt(tx, args), { timeout: 20000 })
    return json(result, 201)
  } catch (e) {
    return handleError(e, "The note could not be edited. No changes were made.", PRISMA_MESSAGES)
  }
}
