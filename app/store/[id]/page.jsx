import { notFound, redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
// import { requireUser } from '@/lib/auth'
import { getCurrentUser } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import StoreDashboard from '@/dashboard/StoreDashboard'
import styles from '@/dashboard/store.module.css'

export default async function StorePage({ params }) {
  const { id } = await params

  // const currentUser = await requireUser()
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  const [store, categories, transfers, logs] = await Promise.all([
    prisma.store.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        entries: {
          where: { isDeleted: false },
          include: {
            product: { include: { unit: true } },
          },
          orderBy: { product: { name: 'asc' } },
        },
      },
    }),
    prisma.category.findMany({
      include: {
        stores: {
          include: { _count: { select: { entries: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
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
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.stockLog.findMany({
      where: { storeId: id, type: { in: ['IN', 'TRANSFER_IN', 'TRANSFER_OUT'] } },
      orderBy: { entryDate: 'desc' },
      select: { productId: true, type: true, quantity: true },
    }),
  ])

  if (!store) notFound()

  // Most recent addition per product, and cumulative deducted per product
  const lastAddedMap = {}
  const deductedMap = {}
  logs.forEach(l => {
    if ((l.type === 'IN' || l.type === 'TRANSFER_IN') && !(l.productId in lastAddedMap)) {
      lastAddedMap[l.productId] = l.quantity  // first hit wins — logs are ordered desc, so this is the latest
    }
    if (l.type === 'TRANSFER_OUT') {
      deductedMap[l.productId] = (deductedMap[l.productId] ?? 0) + l.quantity
    }
  })

  const items = store.entries.map(entry => ({
    id: entry.id,
    productId: entry.productId,
    name: entry.product.name,
    unit: entry.product.unit.name,
    rate: entry.rate,
    quantity: entry.quantity,
    lowStockAt: entry.lowStockAt,
    price: entry.rate * entry.quantity,
    isLow: entry.lowStockAt > 0 && entry.quantity <= entry.lowStockAt,
    totalAdded: lastAddedMap[entry.productId] ?? 0,
    totalDeducted: deductedMap[entry.productId] ?? 0,
    createdAt: entry.updatedAt,
  }))

  // All stores for the transfer target dropdown (excluding current)
  const allStores = categories.flatMap(cat =>
    cat.stores.map(s => ({ ...s, categoryName: cat.name }))
  ).filter(s => s.id !== id)

  const deletedItems = await prisma.stockEntry.findMany({
    where: { storeId: id, isDeleted: true },
    include: { product: { include: { unit: true } } },
    orderBy: { deletedAt: 'desc' },
  })

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={id} />
      <div className={styles.main}>
        <StoreDashboard
          store={{ ...store, items, deletedItems }}
          allStores={allStores}
          transfers={transfers}
          // deletedItems={deletedItems}
          currentUser={currentUser}  // TODO: pass current user from session
        />
      </div>
    </div>
  )
}
