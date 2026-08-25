import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import ProductsManager from '@/components/ProductsManager'
import styles from '@/dashboard/store.module.css'

export default async function ProductsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  const [products, units, categories] = await Promise.all([
    prisma.product.findMany({
      include: { unit: true, _count: { select: { entries: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.unit.findMany({ orderBy: { name: 'asc' } }),
    prisma.category.findMany({
      include: {
        stores: {
          include: { _count: { select: { entries: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} />
      <div className={styles.main}>
        <ProductsManager initialProducts={products} initialUnits={units} />
      </div>
    </div>
  )
}