import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import AppShell from '@/components/AppShell'

// Shared shell for every signed-in page. Layouts persist across navigation, so the
// sidebar keeps its state (open categories, collapsed) while moving between pages.
export default async function AppLayout({ children }) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const [categories, cookieStore] = await Promise.all([
    prisma.category.findMany({
      where: { isSystem: false },
      include: { stores: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    cookies(),
  ])

  return (
    <AppShell
      user={{ id: currentUser.id, username: currentUser.username, role: currentUser.role }}
      categories={categories}
      initialCollapsed={cookieStore.get('sf_sidebar')?.value === 'collapsed'}
    >
      {children}
    </AppShell>
  )
}
