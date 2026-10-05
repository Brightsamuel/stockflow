import prisma from "@/lib/prisma"
import { requireEditor, requireUser } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

export async function GET() {
  try {
    await requireUser()
    return json(await prisma.unit.findMany({ orderBy: { name: "asc" } }))
  } catch (e) {
    return handleError(e, "Failed to load units")
  }
}

// Any signed-in user can add a unit while creating a product
export async function POST(req) {
  try {
    await requireEditor()
    const { name } = await req.json()
    if (!name?.trim()) return fail("Enter a unit name")
    const unit = await prisma.unit.create({ data: { name: name.trim().toLowerCase() } })
    return json(unit, 201)
  } catch (e) {
    return handleError(e, "Failed to create unit", { P2002: "That unit already exists" })
  }
}
