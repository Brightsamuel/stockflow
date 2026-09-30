import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/constants'
import { listUsers } from '@/lib/users'
import UsersManager from '@/components/UsersManager'

export const metadata = { title: 'Users' }

export default async function UsersPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (!isAdminRole(currentUser.role)) redirect('/')

  return <UsersManager users={await listUsers()} currentUserId={currentUser.id} currentUserRole={currentUser.role} />
}
