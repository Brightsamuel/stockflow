import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { NO_OWNER } from "@/lib/owners"

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    if (id === NO_OWNER) return fail("The built-in 'no owner' entry can't be changed")
    const { name } = await req.json()
    if (!name?.trim()) return fail("Enter the owner's name")
    return json(await prisma.stockOwner.update({ where: { id }, data: { name: name.trim() } }))
  } catch (e) {
    return handleError(e, "Failed to rename owner", { P2002: "An owner with that name already exists", P2025: "Owner not found" })
  }
}

// Only an owner nothing refers to can be deleted, so stock and history keep their owner
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    if (id === NO_OWNER) return fail("The built-in 'no owner' entry can't be deleted")
    const owner = await prisma.stockOwner.findUnique({
      where: { id },
      include: { _count: { select: { entries: true, logs: true, transfers: true } } },
    })
    if (!owner) return fail("Owner not found", 404)
    const { entries, logs, transfers } = owner._count
    if (entries + logs + transfers > 0) return fail("This owner has stock or history, so it can't be deleted", 409)
    await prisma.stockOwner.delete({ where: { id } })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete owner")
  }
}
