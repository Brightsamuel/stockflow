import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    const unit = await prisma.unit.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    })
    if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    if (unit._count.products > 0)
      return NextResponse.json(
        { error: "Cannot delete — products are using this unit" },
        { status: 400 }
      )
    await prisma.unit.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete unit" }, { status: 500 })
  }
}

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    const { name } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: "Name required" }, { status: 400 })
    const unit = await prisma.unit.update({
      where: { id },
      data: { name: name.trim().toLowerCase() },
    })
    return NextResponse.json(unit)
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Unit already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to update unit" }, { status: 500 })
  }
}