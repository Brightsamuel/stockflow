import prisma from "@/lib/prisma"
import { requireEditor, requireUser } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { isAdminRole } from "@/lib/constants"
import { PRODUCT_WITH_BALANCES, parseAmount, setOpeningBalance } from "@/lib/openingBalance"

export async function GET() {
  try {
    await requireUser()
    const products = await prisma.product.findMany({ include: PRODUCT_WITH_BALANCES, orderBy: { name: "asc" } })
    return json(products)
  } catch (e) {
    return handleError(e, "Failed to load products")
  }
}

// Body: { name, unitId, openingQty?, openingRate? } — the opening balance is admin-only
export async function POST(req) {
  try {
    const user = await requireEditor()
    const body = await req.json()
    const { name, unitId } = body
    if (!name?.trim() || !unitId) return fail("Enter a product name and choose its unit")

    const openingQty = parseAmount(body.openingQty, "Opening qty") ?? 0
    const openingRate = parseAmount(body.openingRate, "Rate") ?? 0
    if ((openingQty > 0 || openingRate > 0) && !isAdminRole(user.role))
      return fail("Only an admin can set an opening balance", 403)

    const product = await prisma.$transaction(async tx => {
      const created = await tx.product.create({ data: { name: name.trim(), unitId } })
      if (openingQty > 0 || openingRate > 0) await setOpeningBalance(tx, created.id, openingQty, openingRate, user.id)
      return tx.product.findUnique({ where: { id: created.id }, include: PRODUCT_WITH_BALANCES })
    })
    return json(product, 201)
  } catch (e) {
    return handleError(e, "Failed to create product", { P2002: "A product with that name already exists" })
  }
}
