'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  IconBuildingWarehouse, IconChevronRight, IconEye, IconEyeOff, IconFolderPlus, IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand, IconBuildingStore, IconLogout, IconPencil, IconPlus, IconSearch, IconTrash, IconX,
} from '@tabler/icons-react'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { ROLE_LABEL, isAdminRole } from '@/lib/constants'
import { initials } from '@/lib/format'
import { MAIN_NAV, ADMIN_NAV, APPROVALS_NAV, isActivePath } from '@/components/nav'
import styles from './Sidebar.module.css'

// awaitingApproval: stock outs waiting for an approver (shown to approvers on the Approvals item)
export default function Sidebar({
  categories, currentUser, companyName, collapsed, onToggle, mobileOpen, onCloseMobile, onOpenSearch, awaitingApproval = 0,
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { confirm, toast } = useConfirm()

  // Categories are open unless the user closed them; the sidebar lives in the shared
  // layout and is never remounted, so this survives page changes
  const [closedCats, setClosedCats] = useState(() => new Set())
  const [newCategory, setNewCategory] = useState(null)
  const [newStore, setNewStore] = useState(null) // { categoryId, name }
  const [renaming, setRenaming] = useState(null) // { kind: 'category' | 'store', id, name }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const canManage = isAdminRole(currentUser.role)
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN'
  const activeStoreId = pathname.startsWith('/store/') ? pathname.split('/')[2] : null

  function toggleCategory(id) {
    setClosedCats(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Runs a structure change, shows its error inline and refreshes the layout's store list
  async function run(action) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      router.refresh()
      return true
    } catch (error) {
      setMessage(error.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function submitCategory(e) {
    e.preventDefault()
    const name = newCategory?.trim()
    if (!name) return
    if (await run(() => api('/api/categories', { method: 'POST', body: { name } }))) {
      setNewCategory(null)
      toast(`Category "${name}" created`)
    }
  }

  async function submitStore(e) {
    e.preventDefault()
    const name = newStore?.name.trim()
    if (!name) return
    let created
    if (await run(async () => { created = await api('/api/stores', { method: 'POST', body: { name, categoryId: newStore.categoryId } }) })) {
      setNewStore(null)
      router.push(`/store/${created.id}`)
    }
  }

  async function submitRename(e) {
    e.preventDefault()
    const name = renaming?.name.trim()
    if (!name) return
    const url = renaming.kind === 'category' ? `/api/categories/${renaming.id}` : `/api/stores/${renaming.id}`
    if (await run(() => api(url, { method: 'PATCH', body: { name } }))) setRenaming(null)
  }

  async function deleteCategory(cat) {
    const ok = await confirm({
      title: 'Delete category',
      message: `Delete "${cat.name}"? A category can only be deleted once it has no stores.`,
      confirmLabel: 'Delete category',
      danger: true,
    })
    if (ok) run(() => api(`/api/categories/${cat.id}`, { method: 'DELETE' }))
  }

  async function deleteStore(store) {
    const ok = await confirm({
      title: 'Delete store',
      message: `Delete "${store.name}"? Only a store that has never held stock can be deleted; stores with history are kept so their records stay intact.`,
      confirmLabel: 'Delete store',
      danger: true,
    })
    if (!ok) return
    if (await run(() => api(`/api/stores/${store.id}`, { method: 'DELETE' })) && activeStoreId === store.id) router.push('/')
  }

  function toggleTracking(cat) {
    run(() => api(`/api/categories/${cat.id}`, { method: 'PATCH', body: { trackLogs: !cat.trackLogs } }))
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    // A full page load clears everything the app had in memory
    window.location.assign('/login')
  }

  function navItem({ href, label, icon: Icon }, badge = 0) {
    const active = isActivePath(pathname, href)
    return (
      <Link
        key={href}
        href={href}
        title={collapsed ? (badge ? `${label} (${badge})` : label) : undefined}
        className={`${styles.link} ${active ? styles.linkActive : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <Icon size={19} stroke={1.8} />
        <span className={styles.linkLabel}>{label}</span>
        {badge > 0 && <span className={styles.linkBadge}>{badge > 99 ? '99+' : badge}</span>}
      </Link>
    )
  }

  function nameForm(value, onChange, onSubmit, onCancel, placeholder) {
    return (
      <form className={styles.inlineForm} onSubmit={onSubmit}>
        <input
          autoFocus
          className={styles.inlineInput}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
          placeholder={placeholder}
        />
        <div className={styles.inlineActions}>
          <button type="submit" className={styles.inlineSave} disabled={busy || !value.trim()}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className={styles.inlineCancel} onClick={onCancel}>Cancel</button>
        </div>
      </form>
    )
  }

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}
      data-app-sidebar
    >
      <div className={styles.brand}>
        <span className={styles.brandMark}><IconBuildingWarehouse size={19} /></span>
        <div className={styles.brandText}>
          <div className={styles.brandName}>StockFlow</div>
          <div className={styles.brandSub}>{companyName || 'Inventory manager'}</div>
        </div>
        <button type="button" className={`${styles.navIcon} ${styles.brandCollapse}`} onClick={onToggle} title="Collapse sidebar">
          <IconLayoutSidebarLeftCollapse size={19} />
        </button>
        <button type="button" className={`${styles.navIcon} ${styles.mobileClose}`} onClick={onCloseMobile} aria-label="Close menu">
          <IconX size={19} />
        </button>
      </div>

      <button type="button" className={styles.search} onClick={onOpenSearch} title="Quick find (Ctrl+K)">
        <IconSearch size={16} />
        <span className={styles.searchLabel}>Quick find…</span>
        <span className={styles.kbd}>Ctrl K</span>
      </button>

      <div className={styles.scroll}>
        <nav className={styles.section} aria-label="Main">
          {MAIN_NAV.map(item => navItem(item))}
          {currentUser.canApprove && navItem(APPROVALS_NAV, awaitingApproval)}
        </nav>

        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            <span>Stores</span>
            {canManage && (
              <button
                type="button"
                className={styles.miniAction}
                title="New category"
                onClick={() => { setNewCategory(''); setMessage('') }}
              >
                <IconFolderPlus size={15} />
              </button>
            )}
          </div>

          <button type="button" className={`${styles.link} ${styles.railOnly}`} onClick={onToggle} title="Stores">
            <IconBuildingStore size={19} stroke={1.8} />
          </button>

          <div className={styles.tree}>
            {categories.length === 0 && (
              <p className={styles.empty}>
                {canManage ? 'No stores yet. Create a category, then add stores to it.' : 'No stores have been set up yet.'}
              </p>
            )}

            {categories.map(cat => {
              const open = !closedCats.has(cat.id)
              return (
                <div key={cat.id}>
                  <div className={styles.catRow}>
                    <button type="button" className={styles.catToggle} onClick={() => toggleCategory(cat.id)} aria-expanded={open}>
                      <IconChevronRight size={14} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
                      <span className={styles.catName}>{cat.name}</span>
                      <span className={styles.count}>{cat.stores.length}</span>
                    </button>
                    {canManage && (
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.miniAction} title="Add store" onClick={() => { setNewStore({ categoryId: cat.id, name: '' }); setMessage('') }}>
                          <IconPlus size={14} />
                        </button>
                        <button type="button" className={styles.miniAction} title="Rename category" onClick={() => { setRenaming({ kind: 'category', id: cat.id, name: cat.name }); setMessage('') }}>
                          <IconPencil size={14} />
                        </button>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            className={`${styles.miniAction} ${cat.trackLogs ? styles.trackOn : ''}`}
                            title={cat.trackLogs ? 'Activity tracking is on: records who made each change. Click to turn off.' : 'Activity tracking is off. Click to turn on.'}
                            onClick={() => toggleTracking(cat)}
                            disabled={busy}
                          >
                            {cat.trackLogs ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                          </button>
                        )}
                        <button type="button" className={styles.miniAction} title="Delete category" onClick={() => deleteCategory(cat)} disabled={busy}>
                          <IconTrash size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {renaming?.kind === 'category' && renaming.id === cat.id && nameForm(
                    renaming.name, name => setRenaming(r => ({ ...r, name })), submitRename, () => setRenaming(null), 'Category name',
                  )}

                  {open && (
                    <div className={styles.stores}>
                      {cat.stores.map(store => (
                        <div key={store.id}>
                          <div className={`${styles.storeRow} ${store.id === activeStoreId ? styles.storeActive : ''}`}>
                            <Link href={`/store/${store.id}`} className={styles.storeLink} aria-current={store.id === activeStoreId ? 'page' : undefined}>
                              <span className={styles.dot} />
                              <span className={styles.catName}>{store.name}</span>
                            </Link>
                            {canManage && (
                              <div className={styles.rowActions}>
                                <button type="button" className={styles.miniAction} title="Rename store" onClick={() => { setRenaming({ kind: 'store', id: store.id, name: store.name }); setMessage('') }}>
                                  <IconPencil size={14} />
                                </button>
                                <button type="button" className={styles.miniAction} title="Delete store" onClick={() => deleteStore(store)} disabled={busy}>
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                          {renaming?.kind === 'store' && renaming.id === store.id && nameForm(
                            renaming.name, name => setRenaming(r => ({ ...r, name })), submitRename, () => setRenaming(null), 'Store name',
                          )}
                        </div>
                      ))}

                      {cat.stores.length === 0 && <p className={styles.empty}>No stores in this category.</p>}

                      {canManage && (newStore?.categoryId === cat.id
                        ? nameForm(newStore.name, name => setNewStore(s => ({ ...s, name })), submitStore, () => setNewStore(null), 'Store name')
                        : (
                          <button type="button" className={styles.addStore} onClick={() => { setNewStore({ categoryId: cat.id, name: '' }); setMessage('') }}>
                            <IconPlus size={13} /> Add store
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}

            {newCategory !== null && nameForm(newCategory, setNewCategory, submitCategory, () => setNewCategory(null), 'Category name')}
            {message && <div className={styles.message}>{message}</div>}
          </div>
        </div>

        {canManage && (
          <nav className={styles.section} aria-label="Administration">
            <div className={styles.sectionLabel}><span>Admin</span></div>
            {ADMIN_NAV.map(item => navItem(item))}
          </nav>
        )}
      </div>

      <div className={styles.footer}>
        <Link href="/account" className={styles.user} title="My account">
          <span className={styles.avatar}>{initials(currentUser.username)}</span>
          <span className={styles.userText}>
            <span className={styles.userName}>{currentUser.username}</span>
            <span className={styles.userRole}>{ROLE_LABEL[currentUser.role] ?? currentUser.role}</span>
          </span>
        </Link>
        <button type="button" className={`${styles.navIcon} ${styles.railOnly}`} onClick={onToggle} title="Expand sidebar">
          <IconLayoutSidebarLeftExpand size={19} />
        </button>
        <button type="button" className={styles.navIcon} onClick={signOut} title="Sign out">
          <IconLogout size={18} />
        </button>
      </div>
    </aside>
  )
}
