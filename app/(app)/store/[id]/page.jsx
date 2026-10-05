import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { ownerLabel } from '@/lib/owners'
import { LIVE, movementKind, signedChange } from '@/lib/movements'
import StoreDashboard from '@/dashboard/StoreDashboard'

const MOVEMENT_LIMIT = 150

const getStore = cache(id => prisma.store.findUnique({
  where: { id },
  include: {
    category: { select: { id: true, name: true, isSystem: true, trackLogs: true } },
    entries: {
      where: { isDeleted: false },
      include: {
        product: { include: { unit: true } },
        owner: { select: { id: true, name: true } },
        forProject: { select: { id: true, name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { owner: { name: 'asc' } }],
    },
  },
}))

export async function generateMetadata({ params }) {
  const { id } = await params
  const store = await getStore(id)
  return { title: store && !store.category.isSystem ? store.name : 'Store not found' }
}

export default async function StorePage({ params }) {
  const { id } = await params
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const store = await getStore(id)
  // The hidden opening-balance store is managed from Products only
  if (!store || store.category.isSystem) notFound()

  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN'
  const [settings, otherStores, totals, logs, movementTotal, deleted] = await Promise.all([
    getSettings(),
    // Transfer destinations: every other visible store
    prisma.store.findMany({
      where: { id: { not: id }, category: { isSystem: false } },
      select: { id: true, name: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    // Stock moved per row, newest first, for "Last added" and "Deducted"
    prisma.stockLog.findMany({
      where: { storeId: id, type: { in: ['IN', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN'] }, ...LIVE },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      select: { productId: true, ownerId: true, forProjectId: true, type: true, quantity: true },
    }),
    prisma.stockLog.findMany({
      where: { storeId: id, ...LIVE },
      include: {
        product: { include: { unit: true } },
        owner: { select: { id: true, name: true } },
        user: { select: { username: true } },
        forProject: { select: { name: true } },
      },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      take: MOVEMENT_LIMIT,
    }),
    prisma.stockLog.count({ where: { storeId: id, ...LIVE } }),
    isSuperAdmin
      ? prisma.stockEntry.findMany({
          where: { storeId: id, isDeleted: true },
          include: { product: { include: { unit: true } }, owner: { select: { id: true, name: true } }, forProject: { select: { name: true } } },
          orderBy: { deletedAt: 'desc' },
        })
      : [],
  ])

  const lastAdded = {}
  const deducted = {}
  // A row: product, owner and the project its stock is kept for (empty = general stock)
  const rowKey = r => `${r.productId}:${r.ownerId}:${r.forProjectId ?? ''}`
  totals.forEach(l => {
    const key = rowKey(l)
    // Logs are newest first, so the first addition seen is the latest
    if (l.type !== 'TRANSFER_OUT' && !(key in lastAdded)) lastAdded[key] = l.quantity
    if (l.type === 'TRANSFER_OUT') deducted[key] = (deducted[key] ?? 0) + l.quantity
  })

  const items = store.entries.map(entry => {
    const key = rowKey(entry)
    return {
      id: entry.id,
      productId: entry.productId,
      name: entry.product.name,
      unit: entry.product.unit.name,
      ownerId: entry.ownerId,
      owner: ownerLabel(entry.owner),
      forProjectId: entry.forProjectId,
      keptFor: entry.forProject?.name ?? null,
      rate: entry.rate,
      quantity: entry.quantity,
      lowStockAt: entry.lowStockAt,
      value: entry.rate * entry.quantity,
      isLow: entry.lowStockAt > 0 && entry.quantity <= entry.lowStockAt,
      lastAdded: lastAdded[key] ?? 0,
      deducted: deducted[key] ?? 0,
      updatedAt: entry.updatedAt,
    }
  })

  const movements = logs.map(l => ({
    id: l.id,
    type: l.type,
    date: l.entryDate,
    kind: movementKind(l),
    productId: l.productId,
    product: l.product.name,
    unit: l.product.unit.name,
    owner: ownerLabel(l.owner),
    keptFor: l.forProject?.name ?? null,
    change: signedChange(l),
    note: l.note,
    refNo: l.refNo,
    takenBy: l.takenBy,
    by: l.user?.username ?? null,
  }))

  const deletedItems = deleted.map(entry => ({
    id: entry.id,
    name: entry.product.name,
    unit: entry.product.unit.name,
    owner: ownerLabel(entry.owner),
    keptFor: entry.forProject?.name ?? null,
    quantity: entry.quantity,
    deletedAt: entry.deletedAt,
  }))

  return (
    <StoreDashboard
      store={{ id: store.id, name: store.name, category: { id: store.category.id, name: store.category.name, trackLogs: store.category.trackLogs } }}
      items={items}
      deletedItems={deletedItems}
      movements={movements}
      movementTotal={movementTotal}
      allStores={otherStores.map(s => ({ id: s.id, name: s.name, categoryName: s.category.name }))}
      currentUser={{ id: currentUser.id, username: currentUser.username, role: currentUser.role }}
      settings={settings}
    />
  )
}
