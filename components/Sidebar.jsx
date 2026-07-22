'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './Sidebar.module.css'

export default function Sidebar({ categories, activeStoreId }) {
  const router = useRouter()
  const [openCats, setOpenCats] = useState(() => {
    const initial = {}
    categories.forEach(cat => {
      initial[cat.id] = true
    })
    return initial
  })

  const [showNewCat, setShowNewCat] = useState(false)
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
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to create category')

      setNewCatName('')
      setShowNewCat(false)
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

      router.refresh()
    } catch (error) {
      setActionMessage(error.message || 'Unable to delete category')
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
        <div className={styles.navLabel}>Categories</div>

        {categories.map(cat => (
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
            <div className={styles.inlineActions}>
              <button type="submit" className={styles.inlineSubmit} disabled={loading}>
                {loading ? '…' : 'Add'}
              </button>
              <button type="button" className={styles.inlineCancel}
                onClick={() => { setShowNewCat(false); setNewCatName('') }}>
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
    </aside>
  )
}
