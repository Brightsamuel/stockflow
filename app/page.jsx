import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import Sidebar from '@/components/Sidebar'
import styles from '@/dashboard/store.module.css'

export default async function RootPage() {
  const firstStore = await prisma.store.findFirst({
    orderBy: { createdAt: 'asc' },
  })

  if (firstStore) {
    redirect(`/store/${firstStore.id}`)
  }

  const categories = await prisma.category.findMany({
    include: {
      stores: {
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} />
      <div className={styles.main}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <i className="ti ti-building-warehouse" />
          </div>
          <h2 className={styles.emptyTitle}>Welcome to StockFlow</h2>
          <p className={styles.emptyText}>
            Create a category using the sidebar on the left, then add a store inside it.
            Your inventory dashboard will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}
