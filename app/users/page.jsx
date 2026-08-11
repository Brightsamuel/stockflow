import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import UsersManager from '@/components/UsersManager'
import styles from '@/dashboard/store.module.css'

export default async function UsersPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (!currentUser.isAdmin) redirect('/')

  const [users, categories] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true, isAdmin: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
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
  ])

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} />
      <div className={styles.main}>
        <UsersManager initialUsers={users} currentUserId={currentUser.id} />
      </div>
    </div>
  )
}