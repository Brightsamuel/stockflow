import prisma from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth"
import { json, handleError } from "@/lib/http"
import { restoreDeletion } from "@/lib/deletions"

const PRISMA_MESSAGES = { P2002: "The stock changed while this was being saved. Reload the page and try again." }

// A note deleted with the notes that used its stock comes back with all of them
export const maxDuration = 60

// POST /api/deletions/:id/restore  (Super admin)
// Body (optional): { preview? }. Brings a deleted note back (with any notes deleted with it): its
// lines count again and the stock they moved is moved again, as long as every store still has enough.
export async function POST(req, { params }) {
  const { id } = await params
  try {
    const user = await requireSuperAdmin()
    const body = await req.json().catch(() => ({}))
    if (body?.preview) return json(await restoreDeletion(prisma, { id, user, preview: true }))
    const result = await prisma.$transaction(tx => restoreDeletion(tx, { id, user }), { timeout: 55000, maxWait: 10000 })
    return json(result)
  } catch (e) {
    return handleError(e, "The note could not be restored. No changes were made.", PRISMA_MESSAGES)
  }
}
