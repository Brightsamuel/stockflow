import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    const { name } = await req.json()
    if (!name?.trim()) return fail("Enter a unit name")
    const unit = await prisma.unit.update({ where: { id }, data: { name: name.trim().toLowerCase() } })
    return json(unit)
  } catch (e) {
    return handleError(e, "Failed to update unit", { P2002: "That unit already exists", P2025: "Unit not found" })
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    const unit = await prisma.unit.findUnique({ where: { id }, include: { _count: { select: { products: true } } } })
    if (!unit) return fail("Unit not found", 404)
    if (unit._count.products > 0) return fail("Products use this unit, so it can't be deleted", 409)
    await prisma.unit.delete({ where: { id } })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete unit")
  }
}
