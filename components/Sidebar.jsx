'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ConfirmProvider'
import styles from './Sidebar.module.css'

const MAIN_LINKS = [
  { href: '/products', icon: 'ti-box', label: 'Products' },
  { href: '/search', icon: 'ti-history', label: 'Product history' },
  { href: '/field-records', icon: 'ti-clipboard-list', label: 'Field records' },
  { href: '/reports', icon: 'ti-report', label: 'Reports' },
]

const ADMIN_LINKS = [
  { href: '/users', icon: 'ti-users', label: 'Users' },
  { href: '/settings', icon: 'ti-settings', label: 'Settings' },
]

const ROLE_LABEL = { STANDARD: 'Standard', ADMIN: 'Admin', SUPER_ADMIN: 'Super admin' }

async function send(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

export default function Sidebar({ categories, currentUser, collapsed, onToggle }) {
  const router = useRouter()
  const pathname = usePathname()
  const { confirm } = useConfirm()

  // Categories are open unless the user closed them; this survives page changes
  // because the sidebar lives in the shared layout and is never remounted
  const [closedCats, setClosedCats] = useState(() => new Set())
  const [showNewCat, setShowNewCat] = useState(false)
  const [showNewStore, setShowNewStore] = useState(null)
  const [editingCatId, setEditingCatId] = useState(null)
  const [editingStoreId, setEditingStoreId] = useState(null)
  const [newCatName, setNewCatName] = useState('')
  const [newStoreName, setNewStoreName] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN'
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'
  const activeStoreId = pathname.startsWith('/store/') ? pathname.split('/')[2] : null

  function toggleCat(id) {
    setClosedCats(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Runs a sidebar action, shows its error inline, and refreshes the layout's category list
  async function run(action, fallbackMessage) {
    setLoading(true)
    setActionMessage('')
    try {
      await action()
      router.refresh()
    } catch (error) {
      setActionMessage(error.message || fallbackMessage)
    } finally {
      setLoading(false)
    }
  }

  function submitNewCategory(e) {
    e.preventDefault()
    if (!newCatName.trim()) return
    run(async () => {
      await send('/api/categories', 'POST', { name: newCatName.trim() })
      setNewCatName('')
      setShowNewCat(false)
    }, 'Unable to create category')
  }

  function updateCategoryName(catId, name) {
    if (!name.trim()) return
    run(async () => {
      await send(`/api/categories/${catId}`, 'PATCH', { name: name.trim() })
      setEditingCatId(null)
    }, 'Unable to rename category')
  }

  async function deleteCategory(catId) {
    const ok = await confirm('Delete this category? It must be empty first.')
    if (!ok) return
    run(() => send(`/api/categories/${catId}`, 'DELETE'), 'Unable to delete category')
  }

  function toggleTrackLogs(catId, next) {
    run(() => send(`/api/categories/${catId}`, 'PATCH', { trackLogs: next }), 'Unable to update tracking')
  }

  function updateStoreName(storeId, name) {
    if (!name.trim()) return
    run(async () => {
      await send(`/api/stores/${storeId}`, 'PATCH', { name: name.trim() })
      setEditingStoreId(null)
    }, 'Unable to rename store')
  }

  async function deleteStore(storeId) {
    const ok = await confirm('Delete this store? This cannot be undone.')
    if (!ok) return
    run(async () => {
      await send(`/api/stores/${storeId}`, 'DELETE')
      if (activeStoreId === storeId) router.push('/')
    }, 'Unable to delete store')
  }

  function submitNewStore(e, categoryId) {
    e.preventDefault()
    if (!newStoreName.trim()) return
    run(async () => {
      const store = await send('/api/stores', 'POST', { name: newStoreName.trim(), categoryId })
      setNewStoreName('')
      setShowNewStore(null)
      router.push(`/store/${store.id}`)
    }, 'Unable to create store')
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function navLink({ href, icon, label }) {
    const active = pathname === href || pathname.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        title={collapsed ? label : undefined}
        className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
      >
        <i className={`ti ${icon}`} />
        {!collapsed && <span>{label}</span>}
      </Link>
    )
  }

  // ── Collapsed: icon rail ────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className={`${styles.sidebar} ${styles.sidebarCollapsed}`}>
        <div className={styles.railHeader}>
          <button className={styles.collapseBtn} onClick={onToggle} title="Expand sidebar">
            <i className="ti ti-layout-sidebar-left-expand" />
          </button>
        </div>
        <nav className={styles.rail}>
          {MAIN_LINKS.map(navLink)}
          <button className={styles.navLink} onClick={onToggle} title="Stores">
            <i className="ti ti-building-warehouse" />
          </button>
          {isAdmin && <div className={styles.railDivider} />}
          {isAdmin && ADMIN_LINKS.map(navLink)}
        </nav>
        <div className={styles.rail} style={{ marginTop: 'auto' }}>
          {navLink({ href: '/account', icon: 'ti-key', label: 'Change password' })}
          <button className={styles.navLink} onClick={signOut} title="Sign out">
            <i className="ti ti-logout" />
          </button>
        </div>
      </aside>
    )
  }

  // ── Expanded ─────────────────────────────────────────────────────────────
  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <i className="ti ti-building-warehouse" style={{ fontSize: 18, color: 'var(--accent)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.appName}>StockFlow</div>
          <div className={styles.appSub}>Inventory manager</div>
        </div>
        <button className={styles.collapseBtn} onClick={onToggle} title="Collapse sidebar">
          <i className="ti ti-layout-sidebar-left-collapse" />
        </button>
      </div>

      <nav className={styles.section}>
        {MAIN_LINKS.map(navLink)}
      </nav>

      <div className={`${styles.section} ${styles.storesSection}`}>
        <div className={styles.navLabel}>Stores</div>

        {categories.length === 0 && (
          <p className={styles.noCats}>No categories yet. Create one below, then add stores to it.</p>
        )}

        {categories.map(cat => {
          const open = !closedCats.has(cat.id)
          return (
            <div key={cat.id} className={styles.catBlock}>
              <div className={styles.catHeader}>
                <button className={styles.catRow} onClick={() => toggleCat(cat.id)}>
                  <i className={`ti ti-chevron-right ${styles.arrow} ${open ? styles.arrowOpen : ''}`} />
                  <i className="ti ti-folder" style={{ fontSize: 14 }} />
                  <span className={styles.truncate}>{cat.name}</span>
                </button>

                <div className={styles.catActions}>
                  <button
                    className={styles.iconAction}
                    title="Rename category"
                    onClick={() => { setEditingCatId(cat.id); setActionMessage('') }}
                  >
                    <i className="ti ti-pencil" />
                  </button>
                  <button
                    className={styles.iconAction}
                    title="Delete category"
                    onClick={() => deleteCategory(cat.id)}
                    disabled={loading}
                  >
                    <i className="ti ti-trash" />
                  </button>
                  {isSuperAdmin && (
                    <button
                      className={styles.iconAction}
                      title={cat.trackLogs ? 'Tracking is ON — click to turn off' : 'Tracking is OFF — click to turn on'}
                      onClick={() => toggleTrackLogs(cat.id, !cat.trackLogs)}
                      disabled={loading}
                    >
                      <i className={`ti ${cat.trackLogs ? 'ti-eye' : 'ti-eye-off'}`} />
                    </button>
                  )}
                </div>
              </div>

              {editingCatId === cat.id && (
                <InlineNameForm
                  initial={cat.name}
                  loading={loading}
                  onSave={name => updateCategoryName(cat.id, name)}
                  onCancel={() => setEditingCatId(null)}
                />
              )}

              {open && (
                <div className={styles.storeList}>
                  {cat.stores.map(store => (
                    <div key={store.id}>
                      <div className={styles.storeRowWrap}>
                        <Link
                          href={`/store/${store.id}`}
                          className={`${styles.storeRow} ${store.id === activeStoreId ? styles.active : ''}`}
                        >
                          <span className={styles.dot} />
                          <span className={styles.truncate}>{store.name}</span>
                        </Link>
                        <div className={styles.storeActions}>
                          <button
                            className={styles.iconAction}
                            title="Rename store"
                            onClick={() => { setEditingStoreId(store.id); setActionMessage('') }}
                          >
                            <i className="ti ti-pencil" />
                          </button>
                          <button
                            className={styles.iconAction}
                            title="Delete store"
                            onClick={() => deleteStore(store.id)}
                            disabled={loading}
                          >
                            <i className="ti ti-trash" />
                          </button>
                        </div>
                      </div>
                      {editingStoreId === store.id && (
                        <InlineNameForm
                          initial={store.name}
                          loading={loading}
                          onSave={name => updateStoreName(store.id, name)}
                          onCancel={() => setEditingStoreId(null)}
                        />
                      )}
                    </div>
                  ))}

                  {showNewStore === cat.id ? (
                    <form className={styles.inlineForm} onSubmit={e => submitNewStore(e, cat.id)}>
                      <input
                        autoFocus
                        className={styles.inlineInput}
                        value={newStoreName}
                        onChange={e => setNewStoreName(e.target.value)}
                        placeholder="Store name…"
                      />
                      <div className={styles.inlineActions}>
                        <button type="submit" className={styles.inlineSubmit} disabled={loading}>
                          {loading ? '…' : 'Add'}
                        </button>
                        <button
                          type="button"
                          className={styles.inlineCancel}
                          onClick={() => { setShowNewStore(null); setNewStoreName('') }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button className={styles.addStoreBtn} onClick={() => setShowNewStore(cat.id)}>
                      <i className="ti ti-plus" style={{ fontSize: 13 }} /> Add store
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {actionMessage && <div className={styles.actionMessage}>{actionMessage}</div>}

        {showNewCat ? (
          <form className={styles.newCatForm} onSubmit={submitNewCategory}>
            <input
              autoFocus
              className={styles.inlineInput}
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Category name…"
            />
            <div className={styles.inlineActions}>
              <button type="submit" className={styles.inlineSubmit} disabled={loading}>
                {loading ? '…' : 'Add'}
              </button>
              <button
                type="button"
                className={styles.inlineCancel}
                onClick={() => { setShowNewCat(false); setNewCatName('') }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className={styles.newCatBtn} onClick={() => setShowNewCat(true)}>
            <i className="ti ti-plus" style={{ fontSize: 14 }} />
            New category
          </button>
        )}
      </div>

      {isAdmin && (
        <nav className={styles.section}>
          <div className={styles.navLabel}>Admin</div>
          {ADMIN_LINKS.map(navLink)}
        </nav>
      )}

      <div className={styles.footer}>
        <div className={styles.userChip}>
          <span className={styles.avatar}>{currentUser?.username?.[0]?.toUpperCase() ?? '?'}</span>
          <div style={{ minWidth: 0 }}>
            <div className={`${styles.userName} ${styles.truncate}`}>{currentUser?.username}</div>
            <div className={styles.appSub}>{ROLE_LABEL[currentUser?.role] ?? currentUser?.role}</div>
          </div>
        </div>
        <div className={styles.footerActions}>
          <Link href="/account" className={styles.footerBtn} title="Change password">
            <i className="ti ti-key" /> Password
          </Link>
          <button className={styles.footerBtn} onClick={signOut} title="Sign out">
            <i className="ti ti-logout" /> Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}

function InlineNameForm({ initial, loading, onSave, onCancel }) {
  const [value, setValue] = useState(initial)
  return (
    <form
      className={styles.inlineForm}
      onSubmit={e => { e.preventDefault(); onSave(value) }}
    >
      <input
        autoFocus
        className={styles.inlineInput}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
      />
      <div className={styles.inlineActions}>
        <button type="submit" className={styles.inlineSubmit} disabled={loading}>
          {loading ? '…' : 'Save'}
        </button>
        <button type="button" className={styles.inlineCancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
