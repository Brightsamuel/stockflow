import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import Sidebar from '@/components/Sidebar'
import StoreDashboard from '@/dashboard/StoreDashboard'
import styles from '@/dashboard/store.module.css'

export default async function StorePage({ params }) {
  const { id } = await params

  const [store, categories, transfers] = await Promise.all([
    prisma.store.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        items: { orderBy: { name: 'asc' } },
      },
    }),
    prisma.category.findMany({
      include: {
        stores: {
          include: { _count: { select: { items: true } } },
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
        sourceStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        targetStore: { select: { id: true, name: true, category: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  if (!store) notFound()

  // Attach computed price and low stock flag to each item
  const items = store.items.map(item => ({
    ...item,
    price: item.rate * item.quantity,
    isLow: item.lowStockAt > 0 && item.quantity <= item.lowStockAt,
  }))

  // All stores for the transfer target dropdown (excluding current)
  const allStores = categories.flatMap(cat =>
    cat.stores.map(s => ({ ...s, categoryName: cat.name }))
  ).filter(s => s.id !== id)

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={id} />
      <div className={styles.main}>
        <StoreDashboard
          store={{ ...store, items }}
          allStores={allStores}
          transfers={transfers}
        />
      </div>
    </div>
  )
}
