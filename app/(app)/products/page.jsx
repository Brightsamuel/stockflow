import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProductsManager from '@/components/ProductsManager'
import { PRODUCT_WITH_BALANCES } from '@/lib/openingBalance'

export default async function ProductsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  const [products, units, stores] = await Promise.all([
    prisma.product.findMany({
      include: PRODUCT_WITH_BALANCES,
      orderBy: { name: 'asc' },
    }),
    prisma.unit.findMany({ orderBy: { name: 'asc' } }),
    prisma.store.findMany({
      where: { category: { isSystem: false } },
      select: { id: true, name: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const allStores = stores.map(s => ({ id: s.id, name: s.name, categoryName: s.category.name }))

  return (
    <ProductsManager
      initialProducts={products}
      initialUnits={units}
      allStores={allStores}
      isAdmin={currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN'}
    />
  )
}
