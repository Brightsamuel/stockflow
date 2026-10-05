import prisma from "@/lib/prisma"
import { NO_OWNER } from "@/lib/owners"
import { LIVE } from "@/lib/movements"

// Everyone recorded as having taken stock out, for name suggestions
export async function listTakers() {
  const rows = await prisma.stockLog.findMany({
    where: { takenBy: { not: null }, ...LIVE },
    distinct: ["takenBy"],
    select: { takenBy: true },
    orderBy: { takenBy: "asc" },
  })
  return rows.map(r => r.takenBy)
}

// Everyone named on stock records (taken by, delivered / issued / dispatched by, received by),
// for suggestions in the name boxes of the stock forms
const PERSON_FIELDS = ["takenBy", "handedOverBy", "receivedBy"]

export async function listPeople() {
  const lists = await Promise.all(PERSON_FIELDS.map(field =>
    prisma.stockLog.findMany({ where: { [field]: { not: null }, ...LIVE }, distinct: [field], select: { [field]: true } })))
  const names = new Set(lists.flatMap((rows, i) => rows.map(r => r[PERSON_FIELDS[i]])))
  return [...names].sort((a, b) => a.localeCompare(b))
}

// Data the report filters need (Reports and Field records pages)
export async function loadReportOptions() {
  const [categories, owners, projects, recipients, takers] = await Promise.all([
    prisma.category.findMany({
      where: { isSystem: false },
      include: { stores: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.stockOwner.findMany({ where: { id: { not: NO_OWNER } }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    prisma.recipient.findMany({ orderBy: { name: "asc" } }),
    listTakers(),
  ])
  return { categories, owners, projects, recipients, takers }
}
