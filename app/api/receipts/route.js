// app/api/receipts/route.js
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const logs = await prisma.stockLog.findMany({
      where: { refNo: { not: null } },
      select: {
        refNo: true,
        createdAt: true,
        product: { select: { name: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    // Collapse to one row per refNo — first occurrence (most recent, since ordered desc)
    const seen = new Map()
    logs.forEach(l => {
      if (!seen.has(l.refNo)) {
        seen.set(l.refNo, {
          id: l.refNo,
          refNo: l.refNo,
          createdAt: l.createdAt,
          preview: `${l.product.name} · ${l.store.name}`,
        })
      }
    })

    return NextResponse.json([...seen.values()])
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 })
  }
}