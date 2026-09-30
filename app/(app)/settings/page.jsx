import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/constants'
import { getSettings } from '@/lib/settings'
import SettingsForm from '@/components/SettingsForm'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (!isAdminRole(currentUser.role)) redirect('/')

  return <SettingsForm initialSettings={await getSettings()} />
}
