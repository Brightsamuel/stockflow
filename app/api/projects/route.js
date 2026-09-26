import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"

// Projects (field sites) that stock can be issued to
export async function GET() {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  const projects = await prisma.project.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(projects)
}

export async function POST(req) {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: "You must be signed in to do this" }, { status: 401 })
  }

  try {
    const { name, location } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: "Project name required" }, { status: 400 })

    const project = await prisma.project.create({
      data: { name: name.trim(), location: location?.trim() || null },
    })
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    if (e.code === "P2002")
      return NextResponse.json({ error: "A project with that name already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }
}
