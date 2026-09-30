import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import ChangePasswordForm from '@/components/ChangePasswordForm'

export const metadata = { title: 'My account' }

export default async function AccountPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  return (
    <ChangePasswordForm
      user={{ username: currentUser.username, role: currentUser.role, createdAt: currentUser.createdAt }}
    />
  )
}
