import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

// Body: { name? } (admins), { trackLogs? } (Super admins only)
export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    const user = await requireAdmin()
    const { name, trackLogs } = await req.json()
    const data = {}
    if (name?.trim()) data.name = name.trim()
    if (trackLogs != null) {
      if (user.role !== "SUPER_ADMIN") return fail("Only a Super admin can turn activity tracking on or off", 403)
      data.trackLogs = Boolean(trackLogs)
    }
    if (!Object.keys(data).length) return fail("Nothing to update")

    const existing = await prisma.category.findUnique({ where: { id }, select: { isSystem: true } })
    if (!existing || existing.isSystem) return fail("Category not found", 404)

    return json(await prisma.category.update({ where: { id }, data }))
  } catch (e) {
    return handleError(e, "Failed to update category", { P2002: "A category with that name already exists" })
  }
}

export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { stores: true } } },
    })
    if (!category || category.isSystem) return fail("Category not found", 404)
    if (category._count.stores > 0) return fail("Remove the stores in this category first")

    await prisma.category.delete({ where: { id } })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete category")
  }
}
