'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { IconBuildingWarehouse, IconMenu2, IconSearch } from '@tabler/icons-react'
import Sidebar from '@/components/Sidebar'
import QuickFind from '@/components/QuickFind'
import styles from './AppShell.module.css'

// Signed-in frame: sidebar (collapsible on desktop, a drawer on small screens), Quick find
// (Ctrl+K) and the page. Lives in the shared layout, so it keeps its state between pages.
export default function AppShell({ user, categories, companyName, initialCollapsed, children }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [drawerPath, setDrawerPath] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)

  // The drawer belongs to the page it was opened on, so navigating closes it
  const drawerOpen = drawerPath === pathname

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Remembered in a cookie so the server renders the right width on the next visit
  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `sf_sidebar=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`} data-app-shell>
      <Sidebar
        categories={categories}
        currentUser={user}
        companyName={companyName}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={drawerOpen}
        onCloseMobile={() => setDrawerPath(null)}
        onOpenSearch={() => { setDrawerPath(null); setSearchOpen(true) }}
      />
      <div
        className={`${styles.overlay} ${drawerOpen ? styles.overlayOpen : ''}`}
        onClick={() => setDrawerPath(null)}
        data-no-print
      />

      <div className={styles.main} data-app-main>
        <div className={styles.topbar} data-app-topbar>
          <button type="button" className={styles.menuButton} onClick={() => setDrawerPath(pathname)} aria-label="Open menu">
            <IconMenu2 size={22} />
          </button>
          <div className={styles.topbarBrand}>
            <span className={styles.topbarMark}><IconBuildingWarehouse size={17} /></span>
            StockFlow
          </div>
          <button type="button" className={styles.menuButton} onClick={() => setSearchOpen(true)} aria-label="Quick find">
            <IconSearch size={20} />
          </button>
        </div>
        {children}
      </div>

      {searchOpen && (
        <QuickFind categories={categories} currentUser={user} onClose={() => setSearchOpen(false)} />
      )}
    </div>
  )
}
