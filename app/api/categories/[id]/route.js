import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    const { name, trackLogs } = await req.json()
    const data = {}
    if (name?.trim()) data.name = name.trim()
    if (trackLogs != null) data.trackLogs = trackLogs
    if (!Object.keys(data).length)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

    const category = await prisma.category.update({ where: { id }, data })
    return NextResponse.json(category)
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "Category already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to rename category" }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    const cat = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { stores: true } } },
    })
    if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (cat._count.stores > 0)
      return NextResponse.json(
        { error: "Remove all stores in this category first" },
        { status: 400 }
      )
    await prisma.category.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}