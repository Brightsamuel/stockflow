import prisma from "@/lib/prisma"
import { NO_OWNER } from "@/lib/owners"

// Data the report filters need (Reports and Field records pages)
export async function loadReportOptions() {
  const [categories, owners, projects] = await Promise.all([
    prisma.category.findMany({
      where: { isSystem: false },
      include: {
        stores: {
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.stockOwner.findMany({ where: { id: { not: NO_OWNER } }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ orderBy: { name: "asc" } }),
  ])
  return { categories, owners, projects }
}
