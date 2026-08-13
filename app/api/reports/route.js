import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"
import { buildReport, buildRecipientReport } from "@/lib/reports"

// GET /api/reports?storeId=X&from=YYYY-MM-DD&to=YYYY-MM-DD
// GET /api/reports?categoryId=Y&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get("storeId")
    const categoryId = searchParams.get("categoryId")
    const external = searchParams.get("external") // "true" or a specific recipientId
    const fromRaw = searchParams.get("from")
    const toRaw = searchParams.get("to")

    if (!fromRaw || !toRaw)
      return NextResponse.json({ error: "from and to dates are required" }, { status: 400 })
    if (!storeId && !categoryId)
      return NextResponse.json({ error: "storeId or categoryId is required" }, { status: 400 })

    const from = new Date(fromRaw + "T00:00:00.000Z")
    const to = new Date(toRaw + "T23:59:59.999Z")
    if (isNaN(from) || isNaN(to))
      return NextResponse.json({ error: "Invalid date" }, { status: 400 })
    if (from > to)
      return NextResponse.json({ error: "'From' date must be before 'To' date" }, { status: 400 })

    // ── External recipient report ───────────────────────────────────────────
    if (external) {
      const recipientId = external === "true" ? null : external
      let label = "All external recipients"
      if (recipientId) {
        const recipient = await prisma.recipient.findUnique({ where: { id: recipientId } })
        if (!recipient) return NextResponse.json({ error: "Recipient not found" }, { status: 404 })
        label = recipient.company ? `${recipient.name} (${recipient.company})` : recipient.name
      }
      const rows = await buildRecipientReport(recipientId, from, to)
      return NextResponse.json({ scope: "external", label, from: fromRaw, to: toRaw, rows })
    }

    if (!storeId && !categoryId)
      return NextResponse.json({ error: "storeId or categoryId is required" }, { status: 400 })

    let storeIds
    let meta

    if (storeId) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, category: { select: { name: true } } },
      })
      if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 })
      storeIds = [store.id]
      meta = { scope: "store", label: `${store.name} (${store.category.name})` }
    } else {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        include: { stores: { select: { id: true, name: true } } },
      })
      if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 })
      storeIds = category.stores.map(s => s.id)
      meta = { scope: "category", label: category.name }
    }

    const rows = await buildReport(storeIds, from, to)

    return NextResponse.json({
      ...meta,
      from: fromRaw,
      to: toRaw,
      rows,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Failed to build report" }, { status: 500 })
  }
}