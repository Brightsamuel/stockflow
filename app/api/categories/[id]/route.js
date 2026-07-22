import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function PATCH(req, { params }) {
  try {
    const { id } = await params
    const { name } = await req.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const category = await prisma.category.update({
      where: { id },
      data: { name: name.trim() },
    })

    return NextResponse.json(category)
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 })
    }
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params

    const category = await prisma.category.findUnique({
      where: { id },
      include: { stores: { select: { id: true } } },
    })

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    if (category.stores.length > 0) {
      return NextResponse.json(
        { error: "Category cannot be deleted while it still contains stores" },
        { status: 409 },
      )
    }

    await prisma.category.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 })
  }
}
