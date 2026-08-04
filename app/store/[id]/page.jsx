import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import Sidebar from '@/components/Sidebar'
import StoreDashboard from '@/dashboard/StoreDashboard'
import styles from '@/dashboard/store.module.css'

export default async function StorePage({ params }) {
  const { id } = await params

  const [store, categories, transfers, logs] = await Promise.all([
    prisma.store.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        entries: {
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
        sourceStore: { select: { id: true, name: true, category: { select: { name: true } } } },
        targetStore: { select: { id: true, name: true, category: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.stockLog.groupBy({
      by: ['productId', 'type'],
      where: { storeId: id },
      _sum: { quantity: true },
    }),
  ])

  if (!store) notFound()

  const logMap = {}
  logs.forEach(l => {
    if (!logMap[l.productId]) logMap[l.productId] = { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }
    logMap[l.productId][l.type] = l._sum.quantity ?? 0
  })

  const items = store.entries.map(entry => {
    const m = logMap[entry.productId] ?? { IN: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0 }
    return {
      id: entry.id,
      productId: entry.productId,
      name: entry.product.name,
      unit: entry.product.unit.name,
      rate: entry.rate,
      quantity: entry.quantity,
      lowStockAt: entry.lowStockAt,
      price: entry.rate * entry.quantity,
      isLow: entry.lowStockAt > 0 && entry.quantity <= entry.lowStockAt,
      totalAdded: m.IN + m.TRANSFER_IN,
      totalDeducted: m.TRANSFER_OUT,
      createdAt: entry.createdAt,
    }
  })

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
