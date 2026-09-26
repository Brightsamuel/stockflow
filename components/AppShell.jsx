'use client'
import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import styles from '@/dashboard/store.module.css'

export default function AppShell({ user, categories, initialCollapsed, children }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)

  // Remembered in a cookie so the server renders the right width on the next visit
  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `sf_sidebar=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`}>
      <Sidebar categories={categories} currentUser={user} collapsed={collapsed} onToggle={toggle} />
      <div className={styles.main}>{children}</div>
    </div>
  )
}
