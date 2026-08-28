'use client'
// import { getCurrentUser } from '@/lib/auth'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './Sidebar.module.css'

export default function Sidebar({ categories, activeStoreId, currentUser }) {
  const router = useRouter()
  // const [currentUser, setCurrentUser] = useState(initialUser)
  const [categoryList, setCategoryList] = useState(categories)
  const [openCats, setOpenCats] = useState(() => {
    const initial = {}
    categories.forEach(cat => {
      initial[cat.id] = true
    })
    return initial
  })

  async function refreshCategories() {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json().catch(() => [])
      if (!Array.isArray(data)) return

      setCategoryList(data)
      setOpenCats(prev => {
        const next = {}
        data.forEach(cat => {
          next[cat.id] = prev[cat.id] ?? true
        })
        return next
      })
    } catch {
      // keep the current sidebar state if the refetch fails
    }
  }

  // useEffect(() => {
  //   if (initialUser) return undefined

  //   fetch('/api/auth/me')
  //     .then(res => res.json())
  //     .then(data => setCurrentUser(data))
  //     .catch(() => setCurrentUser(null))
  // }, [initialUser])

  useEffect(() => {
    setCategoryList(categories)
    setOpenCats(prev => {
      const next = {}
      categories.forEach(cat => {
        next[cat.id] = prev[cat.id] ?? true
      })
      return next
    })
  }, [categories])

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN'

  const [showNewCat, setShowNewCat] = useState(false)
  // const [newCatTrackLogs, setNewCatTrackLogs] = useState(false)
  const [showNewStore, setShowNewStore] = useState(null)
  const [editingCatId, setEditingCatId] = useState(null)
  const [editingStoreId, setEditingStoreId] = useState(null)
  const [newCatName, setNewCatName] = useState('')
  const [newStoreName, setNewStoreName] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  function toggleCat(id) {
    setOpenCats(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function submitNewCategory(e) {
    e.preventDefault()
    if (!newCatName.trim()) return
    setLoading(true)
    setActionMessage('')

    try {
      // const res = await fetch('/api/categories', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ name: newCatName.trim(), trackLogs: newCatTrackLogs }),
      // })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to create category')

      setNewCatName('')
      setNewCatTrackLogs(false)
      setShowNewCat(false)
      await refreshCategories()
      router.refresh()
    } catch (error) {
      setActionMessage(error.message || 'Unable to create category')
    } finally {
      setLoading(false)
    }
  }

  async function updateCategoryName(catId, name) {
    if (!name.trim()) return
    setLoading(true)
    setActionMessage('')

    try {
      const res = await fetch(`/api/categories/${catId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to rename category')

      setEditingCatId(null)
      await refreshCategories()
      router.refresh()
    } catch (error) {
      setActionMessage(error.message || 'Unable to rename category')
    } finally {
      setLoading(false)
    }
  }

  async function deleteCategory(catId) {
    if (!confirm('Delete this category? It must be empty first.')) return
    setLoading(true)
    setActionMessage('')

    try {
      const res = await fetch(`/api/categories/${catId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to delete category')

      await refreshCategories()
      router.refresh()
    } catch (error) {
      setActionMessage(error.message || 'Unable to delete category')
    } finally {
      setLoading(false)
    }
  }

  async function toggleTrackLogs(catId, next) {
    setLoading(true)
    setActionMessage('')
    try {
      const res = await fetch(`/api/categories/${catId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackLogs: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to update tracking')
      await refreshCategories()
      router.refresh()
    } catch (error) {
      setActionMessage(error.message || 'Unable to update tracking')
    } finally {
      setLoading(false)
    }
  }

  async function updateStoreName(storeId, name) {
    if (!name.trim()) return
    setLoading(true)
    setActionMessage('')

    try {
      const res = await fetch(`/api/stores/${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to rename store')

      setEditingStoreId(null)
      await refreshCategories()
      router.refresh()
    } catch (error) {
      setActionMessage(error.message || 'Unable to rename store')
    } finally {
      setLoading(false)
    }
  }

  async function deleteStore(storeId) {
    if (!confirm('Delete this store? This cannot be undone.')) return
    setLoading(true)
    setActionMessage('')

    try {
      const res = await fetch(`/api/stores/${storeId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to delete store')

      await refreshCategories()
      router.refresh()
      if (activeStoreId === storeId) {
        router.push('/')
      }
    } catch (error) {
      setActionMessage(error.message || 'Unable to delete store')
    } finally {
      setLoading(false)
    }
  }

  async function submitNewStore(e, categoryId) {
    e.preventDefault()
    if (!newStoreName.trim()) return
    setLoading(true)
    setActionMessage('')

    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStoreName.trim(), categoryId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to create store')

      setNewStoreName('')
      setShowNewStore(null)
      await refreshCategories()
      router.push(`/store/${data.id}`)
      router.refresh()
    } catch (error) {
      setActionMessage(error.message || 'Unable to create store')
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <i className="ti ti-building-warehouse" style={{ fontSize: 18, color: 'var(--accent)' }} />
        <div>
          <div className={styles.appName}>StockFlow</div>
          <div className={styles.appSub}>Inventory manager</div>
        </div>
      </div>

      <div className={styles.nav}>
        <div className={styles.navLabel} style={{ marginTop: 20 }}>Catalogue</div>
        {isAdmin && (
          <button className={styles.addStoreBtn} onClick={() => router.push('/users')}>
            <i className="ti ti-users" style={{ fontSize: 13 }} /> Manage users
          </button>
        )}
        {isAdmin && (
          <button className={styles.addStoreBtn} onClick={() => router.push('/settings')}>
            <i className="ti ti-settings" style={{ fontSize: 13 }} /> Settings
          </button>
        )}
        <button className={styles.addStoreBtn} onClick={() => router.push('/products')}>
          <i className="ti ti-box" style={{ fontSize: 13 }} /> Manage products
        </button>
        <button className={styles.addStoreBtn} onClick={() => router.push('/search')}>
          <i className="ti ti-history" style={{ fontSize: 13 }} /> Product history
        </button>
        <button className={styles.addStoreBtn} onClick={() => router.push('/reports')}>
          <i className="ti ti-report" style={{ fontSize: 13 }} /> Reports
        </button>

        <div className={styles.navLabel}>Categories</div>
        {categoryList.map(cat => (
          <div key={cat.id} className={styles.catBlock}>
            <div className={styles.catHeader}>
              <button
                className={styles.catRow}
                onClick={() => toggleCat(cat.id)}
              >
                <i className={`ti ti-chevron-right ${styles.arrow} ${openCats[cat.id] ? styles.arrowOpen : ''}`} />
                <i className="ti ti-folder" style={{ fontSize: 14 }} />
                <span>{cat.name}</span>
              </button>

              <div className={styles.catActions}>
                <button
                  className={styles.iconAction}
                  title="Rename category"
                  onClick={() => {
                    setEditingCatId(cat.id)
                    setActionMessage('')
                  }}
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
                {currentUser?.role === 'SUPER_ADMIN' && (
                  <button
                    className={styles.iconAction}
                    title={cat.trackLogs ? "Tracking is ON — click to turn off" : "Tracking is OFF — click to turn on"}
                    onClick={() => toggleTrackLogs(cat.id, !cat.trackLogs)}
                  >
                    <i className={`ti ${cat.trackLogs ? 'ti-eye' : 'ti-eye-off'}`} />
                  </button>
                )}
              </div>
            </div>

            {editingCatId === cat.id && (
              <div className={styles.inlineForm}>
                <input
                  autoFocus
                  className={styles.inlineInput}
                  defaultValue={cat.name}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      updateCategoryName(cat.id, e.currentTarget.value)
                    }
                    if (e.key === 'Escape') {
                      setEditingCatId(null)
                    }
                  }}
                />
                <div className={styles.inlineActions}>
                  <button type="button" className={styles.inlineSubmit} onClick={(e) => {
                    e.preventDefault()
                    const input = e.currentTarget.parentElement.parentElement.querySelector('input')
                    updateCategoryName(cat.id, input.value)
                  }} disabled={loading}>
                    {loading ? '…' : 'Save'}
                  </button>
                  <button type="button" className={styles.inlineCancel} onClick={() => setEditingCatId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {openCats[cat.id] && (
              <div className={styles.storeList}>
                {cat.stores.map(store => (
                  <div key={store.id} className={styles.storeRowWrap}>
                    <button
                      className={`${styles.storeRow} ${store.id === activeStoreId ? styles.active : ''}`}
                      onClick={() => router.push(`/store/${store.id}`)}
                    >
                      <span className={styles.dot} />
                      <span>{store.name}</span>
                    </button>

                    <div className={styles.storeActions}>
                      <button
                        className={styles.iconAction}
                        title="Rename store"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingStoreId(store.id)
                          setActionMessage('')
                        }}
                      >
                        <i className="ti ti-pencil" />
                      </button>
                      <button
                        className={styles.iconAction}
                        title="Delete store"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteStore(store.id)
                        }}
                        disabled={loading}
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  </div>
                ))}

                {editingStoreId && cat.stores.some(store => store.id === editingStoreId) && (
                  <div className={styles.inlineForm}>
                    <input
                      autoFocus
                      className={styles.inlineInput}
                      defaultValue={cat.stores.find(store => store.id === editingStoreId)?.name || ''}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          updateStoreName(editingStoreId, e.currentTarget.value)
                        }
                        if (e.key === 'Escape') {
                          setEditingStoreId(null)
                        }
                      }}
                    />
                    <div className={styles.inlineActions}>
                      <button type="button" className={styles.inlineSubmit} onClick={(e) => {
                        e.preventDefault()
                        const input = e.currentTarget.parentElement.parentElement.querySelector('input')
                        updateStoreName(editingStoreId, input.value)
                      }} disabled={loading}>
                        {loading ? '…' : 'Save'}
                      </button>
                      <button type="button" className={styles.inlineCancel} onClick={() => setEditingStoreId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {showNewStore === cat.id ? (
                  <form
                    className={styles.inlineForm}
                    onSubmit={e => submitNewStore(e, cat.id)}
                  >
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
                      <button type="button" className={styles.inlineCancel}
                        onClick={() => { setShowNewStore(null); setNewStoreName('') }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className={styles.addStoreBtn}
                    onClick={() => setShowNewStore(cat.id)}
                  >
                    <i className="ti ti-plus" style={{ fontSize: 13 }} /> Add store
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {actionMessage && <div className={styles.actionMessage}>{actionMessage}</div>}

        {/* New category */}
        {showNewCat ? (
          <form className={styles.newCatForm} onSubmit={submitNewCategory}>
            <input
              autoFocus
              className={styles.inlineInput}
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Category name…"
            />
            {/* <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={newCatTrackLogs}
                onChange={e => setNewCatTrackLogs(e.target.checked)}
              />
              Track who adds/edits/transfers stock in this category
            </label> */}
            <div className={styles.inlineActions}>
              <button type="submit" className={styles.inlineSubmit} disabled={loading}>
                {loading ? '…' : 'Add'}
              </button>
              <button type="button" className={styles.inlineCancel}
                onClick={() => { setShowNewCat(false); setNewCatName(''); setNewCatTrackLogs(false) }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className={styles.newCatBtn} onClick={() => setShowNewCat(true)}>
            <i className="ti ti-plus" style={{ fontSize: 14 }} /> New category
          </button>
        )}
      </div>

      <div style={{ marginTop: 'auto', padding: '12px 16px' }}>
        <button
          className={styles.addStoreBtn}
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' })
            router.push('/login')
            router.refresh()
          }}
        >
          <i className="ti ti-logout" style={{ fontSize: 13 }} /> Sign out
        </button>
      </div>
    </aside>
  )
}
