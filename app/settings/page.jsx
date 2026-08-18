// app/settings/page.jsx
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import SettingsForm from '@/components/SettingsForm'
import styles from '@/dashboard/store.module.css'

export default async function SettingsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN') redirect('/')

  const [settings, categories] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 'singleton' } }),
    prisma.category.findMany({
      include: { stores: { include: { _count: { select: { entries: true } } }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} />
      <div className={styles.main}>
        <SettingsForm initialSettings={settings ?? {}} />
      </div>
    </div>
  )
}