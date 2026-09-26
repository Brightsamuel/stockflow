import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import ProductsManager from '@/components/ProductsManager'
import { PRODUCT_WITH_BALANCES } from '@/lib/openingBalance'
import styles from '@/dashboard/store.module.css'

export default async function ProductsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  const [products, units, categories] = await Promise.all([
    prisma.product.findMany({
      include: PRODUCT_WITH_BALANCES,
      orderBy: { name: 'asc' },
    }),
    prisma.unit.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({
      where: { isSystem: false },
      include: {
        stores: {
          include: { _count: { select: { entries: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const allStores = categories.flatMap(cat =>
    cat.stores.map(s => ({ id: s.id, name: s.name, categoryName: cat.name }))
  )

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} />
      <div className={styles.main}>
        <ProductsManager
          initialProducts={products}
          initialUnits={units}
          allStores={allStores}
          isAdmin={currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN'}
        />
      </div>
    </div>
  )
}
