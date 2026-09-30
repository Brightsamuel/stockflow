import { cache } from "react"
import prisma from "@/lib/prisma"

// Company details for report headers, notes and the sign-in page (one row, id "singleton")
export const getSettings = cache(async () => {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } })
  return {
    companyName: settings?.companyName ?? "",
    address: settings?.address ?? "",
    phone: settings?.phone ?? "",
    email: settings?.email ?? "",
    logoUrl: settings?.logoUrl ?? "",
  }
})
