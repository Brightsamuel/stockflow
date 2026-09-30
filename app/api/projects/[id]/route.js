import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    const { name, location } = await req.json()
    if (!name?.trim()) return fail("Enter the project name")
    const project = await prisma.project.update({
      where: { id },
      data: { name: name.trim(), location: location?.trim() || null },
    })
    return json(project)
  } catch (e) {
    return handleError(e, "Failed to update project", { P2002: "A project with that name already exists", P2025: "Project not found" })
  }
}

// Only a project with no field records can be deleted
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    const project = await prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { logs: true, transfers: true } } },
    })
    if (!project) return fail("Project not found", 404)
    if (project._count.logs + project._count.transfers > 0)
      return fail("Stock has been issued to this project, so it can't be deleted", 409)
    await prisma.project.delete({ where: { id } })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete project")
  }
}
