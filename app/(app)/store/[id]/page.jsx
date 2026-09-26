import { notFound, redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ownerLabel } from '@/lib/owners'
import StoreDashboard from '@/dashboard/StoreDashboard'

export default async function StorePage({ params }) {
  const { id } = await params

  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  const [store, otherStores, transfers, logs] = await Promise.all([
    prisma.store.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, isSystem: true } },
        entries: {
          where: { isDeleted: false },
          include: {
            product: { include: { unit: true } },
            owner: { select: { id: true, name: true } },
          },
          orderBy: [{ product: { name: 'asc' } }, { owner: { name: 'asc' } }],
        },
      },
    }),
    // Transfer destinations: every other visible store
    prisma.store.findMany({
      where: { id: { not: id }, category: { isSystem: false } },
      select: { id: true, name: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.transfer.findMany({
      where: {
        OR: [{ sourceStoreId: id }, { targetStoreId: id }],
      },
      include: {
        product: { include: { unit: true } },
        sourceStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        targetStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        recipient: { select: { id: true, name: true, company: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.stockLog.findMany({
      where: { storeId: id, type: { in: ['IN', 'TRANSFER_IN', 'TRANSFER_OUT'] } },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      select: { productId: true, ownerId: true, type: true, quantity: true },
    }),
  ])

  // The hidden opening-balance store is managed from Manage Products only
  if (!store || store.category.isSystem) notFound()

  // Most recent addition and cumulative deducted per row (product + owner)
  const lastAddedMap = {}
  const deductedMap = {}
  logs.forEach(l => {
    const key = `${l.productId}:${l.ownerId}`
    if ((l.type === 'IN' || l.type === 'TRANSFER_IN') && !(key in lastAddedMap)) {
      lastAddedMap[key] = l.quantity  // first hit wins — logs are ordered desc, so this is the latest
    }
    if (l.type === 'TRANSFER_OUT') {
      deductedMap[key] = (deductedMap[key] ?? 0) + l.quantity
    }
  })

  const items = store.entries.map(entry => {
    const key = `${entry.productId}:${entry.ownerId}`
    return {
      id: entry.id,
      productId: entry.productId,
      name: entry.product.name,
      unit: entry.product.unit.name,
      ownerId: entry.ownerId,
      owner: ownerLabel(entry.owner),
      rate: entry.rate,
      quantity: entry.quantity,
      lowStockAt: entry.lowStockAt,
      price: entry.rate * entry.quantity,
      isLow: entry.lowStockAt > 0 && entry.quantity <= entry.lowStockAt,
      totalAdded: lastAddedMap[key] ?? 0,
      totalDeducted: deductedMap[key] ?? 0,
      createdAt: entry.updatedAt,
    }
  })

  const allStores = otherStores.map(s => ({ id: s.id, name: s.name, categoryName: s.category.name }))

  const deletedItems = await prisma.stockEntry.findMany({
    where: { storeId: id, isDeleted: true },
    include: { product: { include: { unit: true } }, owner: { select: { id: true, name: true } } },
    orderBy: { deletedAt: 'desc' },
  })

  return (
    <StoreDashboard
      store={{ ...store, items, deletedItems }}
      allStores={allStores}
      transfers={transfers}
      currentUser={{ id: currentUser.id, username: currentUser.username, role: currentUser.role }}
    />
  )
}
