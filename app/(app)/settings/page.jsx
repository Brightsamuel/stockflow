// app/(app)/settings/page.jsx
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SettingsForm from '@/components/SettingsForm'

export default async function SettingsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN') redirect('/')

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } })

  return <SettingsForm initialSettings={settings ?? {}} />
}
