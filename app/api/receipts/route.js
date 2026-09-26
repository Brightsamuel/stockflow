// app/api/receipts/route.js
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"

// GET /api/receipts?q=RCT
// Distinct ref nos (newest first) matching q, with how many lines each has and what kind it is
export async function GET(req) {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  try {
    const q = new URL(req.url).searchParams.get("q")?.trim()

    const groups = await prisma.stockLog.groupBy({
      by: ["refNo"],
      where: { refNo: q ? { contains: q, mode: "insensitive" } : { not: null } },
      _count: { _all: true },
      _max: { entryDate: true },
      orderBy: { _max: { entryDate: "desc" } },
      take: 20,
    })

    const refNos = groups.map(g => g.refNo)
    const logs = await prisma.stockLog.findMany({
      where: { refNo: { in: refNos } },
      select: {
        refNo: true,
        type: true,
        projectId: true,
        recipientId: true,
        product: { select: { name: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    const byRef = new Map()
    logs.forEach(l => {
      if (!byRef.has(l.refNo)) byRef.set(l.refNo, [])
      byRef.get(l.refNo).push(l)
    })

    const receipts = groups.map(g => {
      const lines = byRef.get(g.refNo) ?? []
      const first = lines[0]
      // IN = goods received; OUT to a project/external party = issue; OUT to a store = transfer
      const kind = lines.some(l => l.type === "IN")
        ? "Receipt"
        : lines.some(l => l.type === "TRANSFER_OUT" && (l.projectId || l.recipientId))
          ? "Issue"
          : "Transfer"
      // A transfer writes an OUT and an IN line per item; count items once
      const items = kind === "Transfer" ? lines.filter(l => l.type === "TRANSFER_OUT").length : lines.filter(l => l.type !== "TRANSFER_IN").length
      return {
        id: g.refNo,
        refNo: g.refNo,
        date: g._max.entryDate,
        kind,
        items: items || g._count._all,
        preview: first ? `${first.product.name} · ${first.store.name}` : "",
      }
    })

    return NextResponse.json(receipts)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 })
  }
}
