import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { PRODUCT_WITH_BALANCES, parseAmount, setOpeningBalance } from "@/lib/openingBalance"

export async function GET() {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  const products = await prisma.product.findMany({
    include: PRODUCT_WITH_BALANCES,
    orderBy: { name: "asc" },
  })
  return NextResponse.json(products)
}

export async function POST(req) {
  let user
  try {
    user = await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const body = await req.json()
    const { name, unitId } = body
    if (!name?.trim() || !unitId)
      return NextResponse.json({ error: "Name and unitId required" }, { status: 400 })

    const openingQty = parseAmount(body.openingQty, "Opening qty") ?? 0
    const openingRate = parseAmount(body.openingRate, "Rate") ?? 0
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN"
    if ((openingQty > 0 || openingRate > 0) && !isAdmin)
      return NextResponse.json({ error: "Only admins can set an opening balance" }, { status: 403 })

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: { name: name.trim(), unitId } })
      if (openingQty > 0 || openingRate > 0)
        await setOpeningBalance(tx, created.id, openingQty, openingRate, user.id)
      return tx.product.findUnique({ where: { id: created.id }, include: PRODUCT_WITH_BALANCES })
    })
    return NextResponse.json(product, { status: 201 })
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Product already exists" }, { status: 409 })
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error(e)
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}
