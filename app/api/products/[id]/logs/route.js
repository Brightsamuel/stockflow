import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireSuperAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 403 })
  }

  try {
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    const result = await prisma.stockLog.deleteMany({ where: { productId: id } })
    return NextResponse.json({ success: true, deletedCount: result.count })
  } catch (e) {
    return NextResponse.json({ error: "Failed to clear history" }, { status: 500 })
  }
}