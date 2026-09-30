import Link from 'next/link'
import { IconBuildingWarehouse } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import ui from '@/styles/ui.module.css'

export const metadata = { title: 'Page not found' }

// Any address that matches no page
export default function NotFound() {
  return (
    <main className={ui.page} style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center' }}>
      <section className={ui.card} style={{ width: '100%', maxWidth: 520 }}>
        <EmptyState
          icon={IconBuildingWarehouse}
          title="Page not found"
          action={<Link href="/" className={`${ui.btn} ${ui.btnPrimary}`}>Back to StockFlow</Link>}
        >
          The address may be mistyped, or the page may have moved.
        </EmptyState>
      </section>
    </main>
  )
}
