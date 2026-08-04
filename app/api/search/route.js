import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

// GET /api/search?q=maize
// Returns matching products with their store balances and full movement log
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()

    if (!q || q.length < 1)
      return NextResponse.json([])

    const products = await prisma.product.findMany({
      where: { name: { contains: q } },
      include: {
        unit: true,
        entries: {
          include: {
            store: {
              select: { id: true, name: true, category: { select: { name: true } } },
            },
          },
        },
        logs: {
          include: {
            store: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        transfers: {
          include: {
            sourceStore: { select: { id: true, name: true } },
            targetStore: { select: { id: true, name: true } },
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
