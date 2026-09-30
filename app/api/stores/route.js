import prisma from "@/lib/prisma"
import { requireUser, requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

export async function GET() {
  try {
    await requireUser()
    const stores = await prisma.store.findMany({
      where: { category: { isSystem: false } },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    })
    return json(stores)
  } catch (e) {
    return handleError(e, "Failed to load stores")
  }
}

export async function POST(req) {
  try {
    await requireAdmin()
    const { name, categoryId } = await req.json()
    if (!name?.trim() || !categoryId) return fail("Enter a store name and choose its category")

    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { isSystem: true } })
    if (!category || category.isSystem) return fail("Category not found", 404)

    const store = await prisma.store.create({
      data: { name: name.trim(), categoryId },
      include: { category: { select: { id: true, name: true } } },
    })
    return json(store, 201)
  } catch (e) {
    return handleError(e, "Failed to create store", { P2002: "A store with that name already exists in this category" })
  }
}
