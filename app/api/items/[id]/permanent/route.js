// app/api/items/[id]/permanent/route.js
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
    const existing = await prisma.stockEntry.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    if (!existing.isDeleted)
      return NextResponse.json({ error: "Item must be soft-deleted first" }, { status: 400 })

    await prisma.stockEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to permanently delete" }, { status: 500 })
  }
}