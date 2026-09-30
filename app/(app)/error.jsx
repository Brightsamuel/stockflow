'use client' // Error boundaries must be Client Components
import { useEffect } from 'react'
import Link from 'next/link'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'
import EmptyState from '@/components/ui/EmptyState'
import ui from '@/styles/ui.module.css'

// Something failed while loading a page, most often the database taking too long to wake up
export default function PageError({ error, retry }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className={ui.page}>
      <section className={ui.card}>
        <EmptyState
          icon={IconAlertTriangle}
          title="This page couldn't be loaded"
          action={(
            <div className={ui.row}>
              <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => retry()}>
                <IconRefresh size={17} /> Try again
              </button>
              <Link href="/" className={`${ui.btn} ${ui.btnSecondary}`}>Go to the overview</Link>
            </div>
          )}
        >
          Nothing was changed. This is usually a brief connection problem; trying again normally works.
          {error?.digest && <><br /><span className={ui.mono}>Reference: {error.digest}</span></>}
        </EmptyState>
      </section>
    </div>
  )
}
