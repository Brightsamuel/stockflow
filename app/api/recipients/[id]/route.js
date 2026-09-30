import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"

export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    const { name, company } = await req.json()
    if (!name?.trim()) return fail("Enter the recipient's name")
    const recipient = await prisma.recipient.update({
      where: { id },
      data: { name: name.trim(), company: company?.trim() || null },
    })
    return json(recipient)
  } catch (e) {
    return handleError(e, "Failed to update recipient", { P2025: "Recipient not found" })
  }
}

// Only a recipient nothing was issued to can be deleted
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    await requireAdmin()
    const recipient = await prisma.recipient.findUnique({
      where: { id },
      include: { _count: { select: { logs: true, transfers: true } } },
    })
    if (!recipient) return fail("Recipient not found", 404)
    if (recipient._count.logs + recipient._count.transfers > 0)
      return fail("Stock has been issued to this recipient, so it can't be deleted", 409)
    await prisma.recipient.delete({ where: { id } })
    return json({ success: true })
  } catch (e) {
    return handleError(e, "Failed to delete recipient")
  }
}
