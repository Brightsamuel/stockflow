import prisma from "@/lib/prisma"
import { requireUser } from "@/lib/auth"
import { json, handleError } from "@/lib/http"

// GET /api/search?q=maize[&ownerId=…][&lite=1]
// lite: names only, for suggestions and Quick find. Otherwise matching products with their
// live balances (limited to one owner's stock when ownerId is given). The full movement
// history of a product comes from /api/products/:id/logs.
export async function GET(req) {
  try {
    await requireUser()
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    const ownerId = searchParams.get("ownerId") || null
    if (!q) return json([])

    const where = { name: { contains: q, mode: "insensitive" } }

    if (searchParams.get("lite")) {
      const products = await prisma.product.findMany({
        where,
        select: { id: true, name: true, unit: { select: { name: true } } },
        orderBy: { name: "asc" },
        take: 8,
      })
      return json(products)
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        unit: true,
        entries: {
          where: { isDeleted: false, ...(ownerId && { ownerId }) },
          select: { id: true, quantity: true, rate: true, store: { select: { category: { select: { isSystem: true } } } } },
        },
      },
      orderBy: { name: "asc" },
      take: 25,
    })
    return json(products)
  } catch (e) {
    return handleError(e, "Search failed")
  }
}
