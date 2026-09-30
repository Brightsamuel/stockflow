import prisma from "@/lib/prisma"
import { requireUser, requireAdmin } from "@/lib/auth"
import { json, fail, handleError } from "@/lib/http"
import { getSettings } from "@/lib/settings"

const MAX_LOGO_LENGTH = 1_500_000 // an uploaded logo is stored as a data URL (about 1 MB)

export async function GET() {
  try {
    await requireUser()
    return json(await getSettings())
  } catch (e) {
    return handleError(e, "Failed to load settings")
  }
}

function clean(value, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null
}

export async function PATCH(req) {
  try {
    await requireAdmin()
    const body = await req.json()
    const logoUrl = typeof body.logoUrl === "string" ? body.logoUrl.trim() : ""
    if (logoUrl.length > MAX_LOGO_LENGTH) return fail("The logo is too large. Use an image under 1 MB.")
    if (logoUrl && !/^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(logoUrl))
      return fail("The logo must be an uploaded image or an http(s) link")

    const data = {
      companyName: clean(body.companyName, 120),
      address: clean(body.address),
      phone: clean(body.phone, 60),
      email: clean(body.email, 120),
      logoUrl: logoUrl || null,
    }
    await prisma.settings.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } })
    return json(data)
  } catch (e) {
    return handleError(e, "Failed to save settings")
  }
}
