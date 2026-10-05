import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/constants'
import { NO_OWNER } from '@/lib/owners'
import { plural } from '@/lib/format'
import ListsManager from '@/components/ListsManager'

export const metadata = { title: 'Lists' }

function usage(parts) {
  const used = parts.filter(([count]) => count > 0)
  return used.length ? used.map(([count, word]) => plural(count, word)).join(' · ') : 'Not used yet'
}

export default async function ListsPage({ searchParams }) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (!isAdminRole(currentUser.role)) redirect('/')
  const { tab } = await searchParams

  const [units, owners, projects, recipients] = await Promise.all([
    prisma.unit.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } }),
    prisma.stockOwner.findMany({
      where: { id: { not: NO_OWNER } },
      include: { _count: { select: { entries: true, logs: true, transfers: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.project.findMany({
      include: { _count: { select: { logs: true, transfers: true, keptLogs: true, keptStock: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.recipient.findMany({ include: { _count: { select: { logs: true, transfers: true } } }, orderBy: { name: 'asc' } }),
  ])

  const lists = {
    units: units.map(u => ({
      id: u.id, name: u.name, createdAt: u.createdAt,
      usage: u._count.products, usageLabel: usage([[u._count.products, 'product']]),
    })),
    owners: owners.map(o => ({
      id: o.id, name: o.name, createdAt: o.createdAt,
      usage: o._count.entries + o._count.logs + o._count.transfers,
      usageLabel: usage([[o._count.entries, 'stock row'], [o._count.logs, 'movement']]),
    })),
    projects: projects.map(p => ({
      id: p.id, name: p.name, extra: p.location, createdAt: p.createdAt,
      usage: p._count.logs + p._count.transfers + p._count.keptLogs + p._count.keptStock,
      usageLabel: usage([[p._count.logs, 'issue'], [p._count.keptStock, 'stock row kept for it']]),
    })),
    recipients: recipients.map(r => ({
      id: r.id, name: r.name, extra: r.company, createdAt: r.createdAt,
      usage: r._count.logs + r._count.transfers, usageLabel: usage([[r._count.logs, 'issue']]),
    })),
  }

  return <ListsManager lists={lists} initialTab={typeof tab === 'string' ? tab : 'units'} />
}
