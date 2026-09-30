import prisma from "@/lib/prisma"
import { requireUser, requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

export async function GET() {
  try {
    await requireUser()
    const categories = await prisma.category.findMany({
      where: { isSystem: false },
      include: { stores: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    })
    return json(categories)
  } catch (e) {
    return handleError(e, "Failed to load categories")
  }
}

export async function POST(req) {
  try {
    await requireAdmin()
    const { name } = await req.json()
    if (!name?.trim()) return fail("Enter a category name")
    const category = await prisma.category.create({ data: { name: name.trim(), trackLogs: true } })
    return json(category, 201)
  } catch (e) {
    return handleError(e, "Failed to create category", { P2002: "A category with that name already exists" })
  }
}
