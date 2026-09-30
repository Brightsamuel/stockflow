import { requireUser } from "@/lib/auth"
import { json, fail, handleError, parseDateRange } from "@/lib/http"
import { buildProductHistory } from "@/lib/history"

// GET /api/products/:id/logs?ownerId=…&from=YYYY-MM-DD&to=YYYY-MM-DD
// A product's movements and balances for a period (either date may be left out for all time).
// History is permanent: there is deliberately no way to delete it from here.
export async function GET(req, { params }) {
  const { id } = await params
  try {
    await requireUser()
    const p = new URL(req.url).searchParams
    const { from, to } = parseDateRange(p.get("from"), p.get("to"))
    const history = await buildProductHistory(id, { ownerId: p.get("ownerId") || null, from, to })
    if (!history) return fail("Product not found", 404)
    return json(history)
  } catch (e) {
    return handleError(e, "Failed to load the product's history")
  }
}
