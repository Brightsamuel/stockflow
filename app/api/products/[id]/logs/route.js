import { requireUser } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { buildProductHistory } from "@/lib/history"

// GET /api/products/:id/logs?ownerId=…  — a product's balances and full movement history.
// History is permanent: there is deliberately no way to delete it.
export async function GET(req, { params }) {
  const { id } = await params
  try {
    await requireUser()
    const ownerId = new URL(req.url).searchParams.get("ownerId") || null
    const history = await buildProductHistory(id, ownerId)
    if (!history) return fail("Product not found", 404)
    return json(history)
  } catch (e) {
    return handleError(e, "Failed to load the product's history")
  }
}
