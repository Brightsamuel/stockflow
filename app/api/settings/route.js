import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"

export async function GET() {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } })
  return NextResponse.json(settings ?? {})
}

export async function PATCH(req) {
  try {
    await requireAdmin()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 403 })
  }

  try {
    const { companyName, address, phone, email, logoUrl } = await req.json()
    const settings = await prisma.settings.upsert({
      where: { id: "singleton" },
      update: { companyName, address, phone, email, logoUrl },
      create: { id: "singleton", companyName, address, phone, email, logoUrl },
    })
    return NextResponse.json(settings)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}