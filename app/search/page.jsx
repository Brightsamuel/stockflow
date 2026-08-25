import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import SearchClient from '@/components/SearchClient'
import styles from '@/dashboard/store.module.css'

export default async function SearchPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const categories = await prisma.category.findMany({
    include: {
      stores: {
        include: { _count: { select: { entries: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} currentUser={currentUser} />
      <div className={styles.main}>
        <SearchClient />
      </div>
    </div>
  )
}