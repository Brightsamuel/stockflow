import prisma from "@/lib/prisma"
import { requireEditor, requireUser } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

// Projects (field sites) that stock can be issued to
export async function GET() {
  try {
    await requireUser()
    return json(await prisma.project.findMany({ orderBy: { name: "asc" } }))
  } catch (e) {
    return handleError(e, "Failed to load projects")
  }
}

export async function POST(req) {
  try {
    await requireEditor()
    const { name, location } = await req.json()
    if (!name?.trim()) return fail("Enter the project name")
    const project = await prisma.project.create({ data: { name: name.trim(), location: location?.trim() || null } })
    return json(project, 201)
  } catch (e) {
    return handleError(e, "Failed to create project", { P2002: "A project with that name already exists" })
  }
}
