import prisma from "@/lib/prisma"
import { requireEditor, requireUser } from "@/lib/auth"
import { json, fail, handleError, parseEntryDate, personName } from "@/lib/http"
import { applyReturn, returnable } from "@/lib/returns"
import { recentReturn, savedAgo } from "@/lib/duplicates"

// GET /api/returns?storeId=…&projectId=…
// What the project can still send back to the store, per product and owner
export async function GET(req) {
  try {
    await requireUser()
    const p = new URL(req.url).searchParams
    if (!p.get("storeId") || !p.get("projectId")) return fail("Choose the store and the project")
    return json(await returnable(prisma, { storeId: p.get("storeId"), projectId: p.get("projectId") }))
  } catch (e) {
    return handleError(e, "Failed to load what can be returned")
  }
}

// POST /api/returns
// Body: { storeId, projectId, putBack: "project" | "general", returnedBy?, receivedBy?, refNo?, entryDate?,
//         items: [{ productId, ownerId, quantity }], confirmDuplicate? }
// Stock coming back from a project's site into the store it was issued from.
export async function POST(req) {
  try {
    const user = await requireEditor()
    const { storeId, projectId, putBack, returnedBy, receivedBy, refNo, entryDate, items, confirmDuplicate } = await req.json()
    if (!storeId) return fail("Choose the store")
    if (!projectId) return fail("Choose the project the stock is coming back from")
    if (!["project", "general"].includes(putBack)) return fail("Choose where the returned stock goes")
    if (!Array.isArray(items) || items.length === 0) return fail("Add at least one item")
    for (const [i, item] of items.entries()) {
      if (!item.productId || !item.ownerId || !Number.isFinite(item.quantity) || item.quantity <= 0)
        return fail(`Line ${i + 1}: choose an item and enter a quantity greater than 0`)
    }
    const names = { returnedBy: personName(returnedBy, "Returned by"), receivedBy: personName(receivedBy, "Received by") }
    const date = parseEntryDate(entryDate)

    const [store, project] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId }, include: { category: { select: { trackLogs: true, isSystem: true } } } }),
      prisma.project.findUnique({ where: { id: projectId } }),
    ])
    if (!store || store.category.isSystem) return fail("Store not found", 404)
    if (!project) return fail("Project not found", 404)

    const ref = refNo?.trim() || null
    if (!confirmDuplicate) {
      const earlier = await recentReturn(prisma, { storeId, projectId, refNo: ref, lines: items })
      if (earlier) {
        return json({ duplicate: true, error: `The same return from ${project.name} was saved ${savedAgo(earlier)}. Saving again adds the stock a second time.` }, 409)
      }
    }

    const count = await prisma.$transaction(
      tx => applyReturn(tx, {
        storeId, projectId, projectName: project.name, items, putBack, refNo: ref, entryDate: date,
        userId: store.category.trackLogs ? user.id : null, ...names,
      }),
      { timeout: 20000 },
    )
    return json({ count, refNo: ref }, 201)
  } catch (e) {
    return handleError(e, "The return could not be saved. No changes were made.")
  }
}
