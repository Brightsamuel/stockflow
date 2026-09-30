import Link from 'next/link'
import { IconMapOff } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import ui from '@/styles/ui.module.css'

// e.g. a store that no longer exists
export default function NotFound() {
  return (
    <div className={ui.page}>
      <section className={ui.card}>
        <EmptyState
          icon={IconMapOff}
          title="Not found"
          action={<Link href="/" className={`${ui.btn} ${ui.btnPrimary}`}>Go to the overview</Link>}
        >
          This page doesn&apos;t exist, or it has been removed.
        </EmptyState>
      </section>
    </div>
  )
}
