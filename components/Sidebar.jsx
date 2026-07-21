'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './Sidebar.module.css'

export default function Sidebar({ categories, activeStoreId }) {
  const router = useRouter()
  const [openCats, setOpenCats] = useState(() => {
    // Open the category that contains the active store by default
    const initial = {}
    categories.forEach(cat => {
      if (cat.stores.some(s => s.id === activeStoreId)) initial[cat.id] = true
      else initial[cat.id] = true // open all by default
    })
    return initial
  })

  const [showNewCat, setShowNewCat] = useState(false)
  const [showNewStore, setShowNewStore] = useState(null) // categoryId
  const [newCatName, setNewCatName] = useState('')
  const [newStoreName, setNewStoreName] = useState('')
  const [loading, setLoading] = useState(false)

  function toggleCat(id) {
    setOpenCats(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function submitNewCategory(e) {
    e.preventDefault()
    if (!newCatName.trim()) return
    setLoading(true)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim() }),
    })
    setLoading(false)
    if (res.ok) {
      setNewCatName('')
      setShowNewCat(false)
      router.refresh()
    }
  }

  async function submitNewStore(e, categoryId) {
    e.preventDefault()
    if (!newStoreName.trim()) return
    setLoading(true)
    const res = await fetch('/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStoreName.trim(), categoryId }),
    })
    const data = await res.json()
    setLoading(false)
    if (res.ok) {
      setNewStoreName('')
      setShowNewStore(null)
      router.push(`/store/${data.id}`)
      router.refresh()
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
            <button
              className={styles.catRow}
              onClick={() => toggleCat(cat.id)}
            >
              <i className={`ti ti-chevron-right ${styles.arrow} ${openCats[cat.id] ? styles.arrowOpen : ''}`} />
              <i className="ti ti-folder" style={{ fontSize: 14 }} />
              <span>{cat.name}</span>
            </button>

            {openCats[cat.id] && (
              <div className={styles.storeList}>
                {cat.stores.map(store => (
                  <button
                    key={store.id}
                    className={`${styles.storeRow} ${store.id === activeStoreId ? styles.active : ''}`}
                    onClick={() => router.push(`/store/${store.id}`)}
                  >
                    <span className={styles.dot} />
                    {store.name}
                  </button>
                ))}

                {/* Inline new store form */}
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
