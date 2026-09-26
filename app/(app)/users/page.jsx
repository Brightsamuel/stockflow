import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import UsersManager from '@/components/UsersManager'

export default async function UsersPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN') redirect('/')

  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return <UsersManager initialUsers={users} currentUserId={currentUser.id} currentUserRole={currentUser.role} />
}
