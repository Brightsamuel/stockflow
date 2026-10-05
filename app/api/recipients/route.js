import prisma from "@/lib/prisma"
import { requireEditor, requireUser } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

// External parties that stock can be issued to
export async function GET() {
  try {
    await requireUser()
    return json(await prisma.recipient.findMany({ orderBy: { name: "asc" } }))
  } catch (e) {
    return handleError(e, "Failed to load recipients")
  }
}

export async function POST(req) {
  try {
    await requireEditor()
    const { name, company } = await req.json()
    if (!name?.trim()) return fail("Enter the recipient's name")
    const recipient = await prisma.recipient.create({ data: { name: name.trim(), company: company?.trim() || null } })
    return json(recipient, 201)
  } catch (e) {
    return handleError(e, "Failed to create recipient")
  }
}
