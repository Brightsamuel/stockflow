import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { entries: true } } },
    })
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })
    if (product._count.entries > 0)
      return NextResponse.json(
        { error: "Cannot delete — product exists in store inventories" },
        { status: 400 }
      )
    await prisma.product.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 })
  }
}

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    const { name, unitId } = await req.json()
    const data = {}
    if (name?.trim()) data.name = name.trim()
    if (unitId) data.unitId = unitId
    if (!Object.keys(data).length)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
    const product = await prisma.product.update({
      where: { id },
      data,
      include: { unit: true },
    })
    return NextResponse.json(product)
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Product name already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 })
  }
}