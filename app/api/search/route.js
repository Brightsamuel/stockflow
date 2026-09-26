import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"

// GET /api/search?q=maize&ownerId=<optional>
// Returns matching products with their store balances and full movement log,
// limited to one owner's stock when ownerId is given
export async function GET(req) {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    const ownerId = searchParams.get("ownerId") || null

    if (!q || q.length < 1)
      return NextResponse.json([])

    const byOwner = ownerId ? { ownerId } : {}
    const products = await prisma.product.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      include: {
        unit: true,
        entries: {
          where: byOwner,
          include: {
            store: {
              select: { id: true, name: true, category: { select: { name: true, isSystem: true } } },
            },
            owner: { select: { id: true, name: true } },
          },
        },
        logs: {
          where: byOwner,
          include: {
            store: { select: { id: true, name: true } },
            user: { select: { id: true, username: true } },
            owner: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
      take: 10,
    })

    return NextResponse.json(products)
  } catch (e) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
