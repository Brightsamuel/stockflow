import prisma from "@/lib/prisma"
import { requireApprover } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { decideNote } from "@/lib/approvals"

// POST /api/approvals  (users with the Approver permission)
// Body: { refNo | logId, documentId, action: "approve" | "query", comment? }
// Signs off an issue note (stock out) after the stock has left, or queries it with a comment.
export async function POST(req) {
  try {
    const user = await requireApprover()
    const { refNo, logId, documentId, action, comment } = await req.json()
    const ref = typeof refNo === "string" ? refNo.trim() : ""
    if ((!ref && !logId) || !documentId) return fail("Choose the note to approve")

    const result = await prisma.$transaction(
      tx => decideNote(tx, { refNo: ref || null, logId: ref ? null : logId, documentId, action, comment, user }),
      { timeout: 20000 },
    )
    return json(result, 201)
  } catch (e) {
    return handleError(e, "The approval could not be saved. Nothing was changed.")
  }
}
