import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/constants'
import { PRODUCT_WITH_BALANCES } from '@/lib/openingBalance'
import ProductsManager from '@/components/ProductsManager'

export const metadata = { title: 'Products' }

export default async function ProductsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const [products, units, stores] = await Promise.all([
    prisma.product.findMany({ include: PRODUCT_WITH_BALANCES, orderBy: { name: 'asc' } }),
    prisma.unit.findMany({ orderBy: { name: 'asc' } }),
    prisma.store.findMany({
      where: { category: { isSystem: false } },
      select: { id: true, name: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return (
    <ProductsManager
      initialProducts={products}
      units={units}
      allStores={stores.map(s => ({ id: s.id, name: s.name, categoryName: s.category.name }))}
      isAdmin={isAdminRole(currentUser.role)}
    />
  )
}
