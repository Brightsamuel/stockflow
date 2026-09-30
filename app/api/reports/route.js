import prisma from "@/lib/prisma"
import { requireUser } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { LEDGER_TYPES } from "@/lib/movements"
import {
  buildReport, buildRecipientReport, buildRefReport, buildProjectReport, buildLedgerReport, buildLowStockReport,
} from "@/lib/reports"

// GET /api/reports?scope=…
//   store      storeId, from, to
//   category   categoryId, from, to
//   external   [recipientId], from, to
//   field      [projectId], [takenBy], from, to        (field records)
//   ledger     [storeId | categoryId], [type], from, to
//   lowstock   [storeId | categoryId]
//   ref        refNo
// Every scope except ref also accepts ownerId.

// Store ids for an optional store or category filter (null = every store)
async function storeScope(storeId, categoryId) {
  if (storeId) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, include: { category: { select: { name: true } } } })
    if (!store) return { error: "Store not found" }
    return { storeIds: [store.id], label: `${store.name} (${store.category.name})` }
  }
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId }, include: { stores: { select: { id: true } } } })
    if (!category) return { error: "Category not found" }
    return { storeIds: category.stores.map(s => s.id), label: category.name }
  }
  return { storeIds: null, label: "All stores" }
}

function parseRange(fromRaw, toRaw) {
  if (!fromRaw || !toRaw) return { error: "Choose both dates" }
  const from = new Date(`${fromRaw}T00:00:00.000Z`)
  const to = new Date(`${toRaw}T23:59:59.999Z`)
  if (isNaN(from) || isNaN(to)) return { error: "Invalid date" }
  if (from > to) return { error: "The From date must be on or before the To date" }
  return { from, to }
}

export async function GET(req) {
  try {
    await requireUser()
    const p = new URL(req.url).searchParams
    const scope = p.get("scope")
    const ownerId = p.get("ownerId") || null

    if (scope === "ref") {
      const refNo = p.get("refNo")?.trim()
      if (!refNo) return fail("Enter a ref no.")
      return json({ scope, label: `Ref No. ${refNo}`, refNo, rows: await buildRefReport(refNo) })
    }

    if (scope === "lowstock") {
      const target = await storeScope(p.get("storeId"), p.get("categoryId"))
      if (target.error) return fail(target.error, 404)
      const rows = await buildLowStockReport({ storeIds: target.storeIds, ownerId })
      return json({ scope, label: `Low stock · ${target.label}`, rows })
    }

    const range = parseRange(p.get("from"), p.get("to"))
    if (range.error) return fail(range.error)
    const period = { from: p.get("from"), to: p.get("to") }

    switch (scope) {
      case "store":
      case "category": {
        const id = p.get(scope === "store" ? "storeId" : "categoryId")
        if (!id) return fail(scope === "store" ? "Choose a store" : "Choose a category")
        const target = await storeScope(scope === "store" ? id : null, scope === "category" ? id : null)
        if (target.error) return fail(target.error, 404)
        const rows = await buildReport(target.storeIds, range.from, range.to, ownerId)
        return json({ scope, label: target.label, ...period, rows })
      }
      case "external": {
        const recipientId = p.get("recipientId") || null
        let label = "All external recipients"
        if (recipientId) {
          const recipient = await prisma.recipient.findUnique({ where: { id: recipientId } })
          if (!recipient) return fail("Recipient not found", 404)
          label = recipient.company ? `${recipient.name} (${recipient.company})` : recipient.name
        }
        return json({ scope, label, ...period, rows: await buildRecipientReport(recipientId, range.from, range.to, ownerId) })
      }
      case "field": {
        const projectId = p.get("projectId") || null
        const takenBy = p.get("takenBy")?.trim() || null
        let label = "All projects"
        if (projectId) {
          const project = await prisma.project.findUnique({ where: { id: projectId } })
          if (!project) return fail("Project not found", 404)
          label = project.location ? `${project.name} (${project.location})` : project.name
        }
        const rows = await buildProjectReport(projectId, range.from, range.to, ownerId, takenBy)
        return json({ scope, label, ...period, takenBy, rows })
      }
      case "ledger": {
        const target = await storeScope(p.get("storeId"), p.get("categoryId"))
        if (target.error) return fail(target.error, 404)
        const type = p.get("type") || ""
        const rows = await buildLedgerReport({ storeIds: target.storeIds, from: range.from, to: range.to, ownerId, type })
        const typeLabel = LEDGER_TYPES.find(t => t.value === type)?.label ?? "All movements"
        return json({ scope, label: `Movement ledger · ${target.label}`, typeLabel, ...period, rows })
      }
      default:
        return fail("Unknown report type")
    }
  } catch (e) {
    return handleError(e, "Failed to build the report")
  }
}
