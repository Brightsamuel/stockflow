import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SearchClient from '@/components/SearchClient'
import { NO_OWNER } from '@/lib/owners'

export default async function SearchPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const owners = await prisma.stockOwner.findMany({
    where: { id: { not: NO_OWNER } },
    orderBy: { name: 'asc' },
  })

  return (
    <SearchClient
      currentUser={{ id: currentUser.id, username: currentUser.username, role: currentUser.role }}
      owners={owners}
    />
  )
}
