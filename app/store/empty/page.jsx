// import prisma from '@/lib/prisma'
// import Sidebar from '@/components/Sidebar'
// import styles from '@/dashboard/store.module.css'

// export default async function EmptyStorePage() {
//   const categories = await prisma.category.findMany({
//     include: {
//       stores: {
//         include: { _count: { select: { items: true } } },
//         orderBy: { createdAt: 'asc' },
//       },
//     },
//     orderBy: { createdAt: 'asc' },
//   })

//   return (
//     <div className={styles.shell}>
//       <Sidebar categories={categories} activeStoreId={null} />
//       <div className={styles.main}>
//         <div className={styles.emptyState}>
//           <div className={styles.emptyIcon}>
//             <i className="ti ti-building-warehouse" />
//           </div>
//           <h2 className={styles.emptyTitle}>No stores yet</h2>
//           <p className={styles.emptyText}>
//             Create a category first using the sidebar, then add a store inside it.
//             Your inventory will appear here.
//           </p>
//         </div>
//       </div>
//     </div>
//   )
// }

import prisma from '@/lib/prisma'
import Sidebar from '@/components/Sidebar'
import styles from '@/app/store/[id]/store.module.css'

export default async function EmptyStorePage() {
  const categories = await prisma.category.findMany({
    include: {
      stores: {
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className={styles.shell}>
      <Sidebar categories={categories} activeStoreId={null} />
      <div className={styles.main}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <i className="ti ti-building-warehouse" />
          </div>
          <h2 className={styles.emptyTitle}>No stores yet</h2>
          <p className={styles.emptyText}>
            Create a category first using the sidebar, then add a store inside it.
          </p>
        </div>
      </div>
    </div>
  )
}

