import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  const products = await prisma.product.findMany({
    include: { unit: true, _count: { select: { entries: true } } },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(products)
}

export async function POST(req) {
  try {
    const { name, unitId } = await req.json()
    if (!name?.trim() || !unitId)
      return NextResponse.json({ error: "Name and unitId required" }, { status: 400 })
    const product = await prisma.product.create({
      data: { name: name.trim(), unitId },
      include: { unit: true },
    })
    return NextResponse.json(product, { status: 201 })
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Product already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}