import prisma from "@/lib/prisma"
import { requireUser } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { NO_OWNER } from "@/lib/owners"

// Stock owners, excluding the built-in "unassigned" row
export async function GET() {
  try {
    await requireUser()
    const owners = await prisma.stockOwner.findMany({ where: { id: { not: NO_OWNER } }, orderBy: { name: "asc" } })
    return json(owners)
  } catch (e) {
    return handleError(e, "Failed to load owners")
  }
}

export async function POST(req) {
  try {
    await requireUser()
    const { name } = await req.json()
    if (!name?.trim()) return fail("Enter the owner's name")
    return json(await prisma.stockOwner.create({ data: { name: name.trim() } }), 201)
  } catch (e) {
    return handleError(e, "Failed to create owner", { P2002: "An owner with that name already exists" })
  }
}
