import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import styles from '@/dashboard/store.module.css'

export default async function AccountPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const categories = await prisma.category.findMany({
    where: { isSystem: false },
    include: { stores: { include: { _count: { select: { entries: true } } }, orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} />
      <div className={styles.main}>
        <ChangePasswordForm username={currentUser.username} />
      </div>
    </div>
  )
}
