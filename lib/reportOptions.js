import prisma from "@/lib/prisma"
import { NO_OWNER } from "@/lib/owners"

// Everyone recorded as having taken stock out, for name suggestions
export async function listTakers() {
  const rows = await prisma.stockLog.findMany({
    where: { takenBy: { not: null } },
    distinct: ["takenBy"],
    select: { takenBy: true },
    orderBy: { takenBy: "asc" },
  })
  return rows.map(r => r.takenBy)
}

// Data the report filters need (Reports and Field records pages)
export async function loadReportOptions() {
  const [categories, owners, projects, takers] = await Promise.all([
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
    listTakers(),
  ])
  return { categories, owners, projects, takers }
}
