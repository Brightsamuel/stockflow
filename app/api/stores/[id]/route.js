import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { storeHistory } from "@/lib/guards"

async function findVisibleStore(id) {
  const store = await prisma.store.findUnique({ where: { id }, include: { category: { select: { isSystem: true } } } })
  return store && !store.category.isSystem ? store : null
}

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    const { name } = await req.json()
    if (!name?.trim()) return fail("Enter a store name")
    if (!(await findVisibleStore(id))) return fail("Store not found", 404)

    const store = await prisma.store.update({
      where: { id },
      data: { name: name.trim() },
      include: { category: { select: { id: true, name: true } } },
    })
    return json(store)
  } catch (e) {
    return handleError(e, "Failed to rename store", { P2002: "A store with that name already exists in this category" })
  }
}

// A store can only be deleted while it has no history; otherwise its records would be lost
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    if (!(await findVisibleStore(id))) return fail("Store not found", 404)

    if ((await storeHistory(prisma, id)) > 0)
      return fail("This store has movement history, so it can't be deleted. Its records are kept.", 409)

    await prisma.store.delete({ where: { id } })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete store")
  }
}
