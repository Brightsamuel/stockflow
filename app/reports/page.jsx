import prisma from '@/lib/prisma'
import Sidebar from '@/components/Sidebar'
import ReportBuilder from '@/components/ReportBuilder'
import styles from '@/dashboard/store.module.css'

export default async function ReportsPage() {
  const categories = await prisma.category.findMany({
    include: {
      stores: {
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} />
      <div className={styles.main}>
        <ReportBuilder categories={categories} />
      </div>
    </div>
  )
}