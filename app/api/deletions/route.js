import prisma from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { deleteNote } from "@/lib/deletions"

const PRISMA_MESSAGES = { P2002: "The stock changed while this was being saved. Reload the page and try again." }

// POST /api/deletions  (Super admin)
// Body: { refNo | logId, documentId, reason, preview? }
// Deletes one received, issue or transfer note with all its lines: the stock they moved is put
// back and the lines stop counting, but they are kept and the deletion can be restored.
// preview: only report what it would do to each store row and anything that blocks it.
export async function POST(req) {
  try {
    const user = await requireSuperAdmin()
    const { refNo, logId, documentId, reason, preview } = await req.json()
    const ref = typeof refNo === "string" ? refNo.trim() : ""
    if ((!ref && !logId) || !documentId) return fail("Choose the note to delete")

    const args = { refNo: ref || null, logId: ref ? null : logId, documentId, reason, user }
    // A preview only reads, so it runs its queries side by side instead of in a transaction
    if (preview) return json(await deleteNote(prisma, { ...args, preview: true }))
    const result = await prisma.$transaction(tx => deleteNote(tx, args), { timeout: 20000 })
    return json(result, 201)
  } catch (e) {
    return handleError(e, "The note could not be deleted. No changes were made.", PRISMA_MESSAGES)
  }
}
