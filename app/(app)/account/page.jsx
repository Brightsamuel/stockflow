import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ChangePasswordForm from '@/components/ChangePasswordForm'

export default async function AccountPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  return <ChangePasswordForm username={currentUser.username} />
}
