'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './store.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n) {
  return Number(n).toLocaleString()
}

function timeAgo(date) {
  const diff = (Date.now() - new Date(date)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Stock In Modal ─────────────────────────────────────────────────────────
function StockInModal({ storeId, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', unit: 'kg', rate: '', quantity: '', lowStockAt: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const price = form.rate && form.quantity ? (parseFloat(form.rate) * parseFloat(form.quantity)) : null

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function submit() {
    if (!form.name.trim() || !form.rate || !form.quantity) {
      setError('Name, rate and quantity are required.'); return
    }
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/stores/${storeId}/stock-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          unit: form.unit,
          rate: parseFloat(form.rate),
          quantity: parseFloat(form.quantity),
          lowStockAt: form.lowStockAt ? parseFloat(form.lowStockAt) : 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onDone()
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Stock in</h3>
          <button className={styles.closeBtn} onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Item name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Maize" />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Unit</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)}>
                <option>kg</option>
                <option>litre</option>
                <option>pair</option>
                <option>item</option>
                <option>bag</option>
                <option>box</option>
                <option>tonne</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Rate (UGX per {form.unit})</label>
              <input type="number" min="0" value={form.rate} onChange={e => set('rate', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Quantity</label>
              <input type="number" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="0" />
            </div>
            <div className={styles.field}>
              <label>Low stock alert at</label>
              <input type="number" min="0" value={form.lowStockAt} onChange={e => set('lowStockAt', e.target.value)} placeholder="e.g. 5" />
            </div>
          </div>

          {price !== null && (
            <div className={styles.priceHint}>
              <i className="ti ti-calculator" /> Total value: <strong>UGX {fmt(price)}</strong>
            </div>
          )}

          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={submit} disabled={loading}>
            {loading ? 'Adding…' : 'Add to stock'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stock Out (Transfer) Modal ─────────────────────────────────────────────
function StockOutModal({ store, allStores, onClose, onDone }) {
  const [selectedItemId, setSelectedItemId] = useState('')
  const [targetStoreId, setTargetStoreId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedItem = store.items.find(i => i.id === selectedItemId)

  async function submit() {
    if (!selectedItemId || !targetStoreId || !quantity) {
      setError('All fields are required.'); return
    }
    if (parseFloat(quantity) > selectedItem?.quantity) {
      setError(`Only ${selectedItem.quantity} ${selectedItem.unit} available.`); return
    }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceStoreId: store.id,
          targetStoreId,
          sourceItemId: selectedItemId,
          quantity: parseFloat(quantity),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onDone()
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Stock out — transfer</h3>
          <button className={styles.closeBtn} onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Source store</label>
            <input value={store.name} disabled className={styles.disabledInput} />
          </div>

          <div className={styles.field}>
            <label>Target store</label>
            <select value={targetStoreId} onChange={e => setTargetStoreId(e.target.value)}>
              <option value="">— select destination —</option>
              {allStores.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.categoryName})</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Item to transfer</label>
            <select value={selectedItemId} onChange={e => { setSelectedItemId(e.target.value); setQuantity('') }}>
              <option value="">— select item —</option>
              {store.items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.quantity} {item.unit} available
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Quantity to transfer</label>
            <input
              type="number"
              min="0"
              max={selectedItem?.quantity}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0"
              disabled={!selectedItemId}
            />
            {selectedItem && (
              <span className={styles.fieldHint}>
                Max: {selectedItem.quantity} {selectedItem.unit}
              </span>
            )}
          </div>

          <div className={styles.transferNote}>
            <i className="ti ti-info-circle" />
            Stock will be reduced from <strong>{store.name}</strong> and added to the destination store.
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={submit} disabled={loading}>
            {loading ? 'Transferring…' : 'Confirm transfer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Item Modal ────────────────────────────────────────────────────────
function EditItemModal({ item, onClose, onDone }) {
  const [form, setForm] = useState({
    name: item.name,
    unit: item.unit,
    rate: String(item.rate),
    quantity: String(item.quantity),
    lowStockAt: String(item.lowStockAt),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field, val) { setForm(f => ({ ...f, [field]: val })) }

  async function submit() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          unit: form.unit.trim(),
          rate: parseFloat(form.rate),
          quantity: parseFloat(form.quantity),
          lowStockAt: parseFloat(form.lowStockAt) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onDone()
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Edit item</h3>
          <button className={styles.closeBtn} onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Item name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Unit</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)}>
                <option>kg</option><option>litre</option><option>pair</option>
                <option>item</option><option>bag</option><option>box</option><option>tonne</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Rate (UGX)</label>
              <input type="number" value={form.rate} onChange={e => set('rate', e.target.value)} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Quantity</label>
              <input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Low stock alert at</label>
              <input type="number" value={form.lowStockAt} onChange={e => set('lowStockAt', e.target.value)} />
            </div>
          </div>
          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={submit} disabled={loading}>
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function StoreDashboard({ store, allStores, transfers }) {
  const router = useRouter()
  const [tab, setTab] = useState('inventory')
  const [modal, setModal] = useState(null) // 'in' | 'out' | {edit: item}
  const [deletingId, setDeletingId] = useState(null)

  function refresh() {
    setModal(null)
    router.refresh()
  }

  async function deleteItem(id) {
    if (!confirm('Remove this item from the store?')) return
    setDeletingId(id)
    await fetch(`/api/items/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    router.refresh()
  }

  // Metrics
  const totalItems = store.items.length
  const totalQty = store.items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = store.items.reduce((s, i) => s + i.price, 0)
  const lowCount = store.items.filter(i => i.isLow).length

  return (
    <>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h2 className={styles.storeName}>{store.name}</h2>
          <span className={styles.storeMeta}>
            <i className="ti ti-folder" style={{ fontSize: 12 }} />
            {store.category.name}
          </span>
        </div>
        <div className={styles.topbarActions}>
          <button className={styles.btnGhost} onClick={() => setModal('in')}>
            <i className="ti ti-arrow-bar-down" /> Stock in
          </button>
          <button className={styles.btnPrimary} onClick={() => setModal('out')}>
            <i className="ti ti-arrow-bar-up" /> Stock out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'inventory' ? styles.tabActive : ''}`} onClick={() => setTab('inventory')}>
          Inventory
        </button>
        <button className={`${styles.tab} ${tab === 'transfers' ? styles.tabActive : ''}`} onClick={() => setTab('transfers')}>
          Transfer log
          {transfers.length > 0 && <span className={styles.tabBadge}>{transfers.length}</span>}
        </button>
      </div>

      <div className={styles.content}>
        {/* ── Inventory tab ── */}
        {tab === 'inventory' && (
          <>
            {/* Metric cards */}
            <div className={styles.metrics}>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Unique items</div>
                <div className={styles.metricValue}>{totalItems}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Total quantity</div>
                <div className={styles.metricValue}>{fmt(totalQty)}</div>
              </div>
              <div className={styles.metric}>
                <div className={styles.metricLabel}>Stock value</div>
                <div className={styles.metricValue}>UGX {fmt(totalValue)}</div>
              </div>
              <div className={`${styles.metric} ${lowCount > 0 ? styles.metricWarn : ''}`}>
                <div className={styles.metricLabel}>Low stock</div>
                <div className={styles.metricValue}>{lowCount}</div>
              </div>
            </div>

            {/* Items table */}
            {store.items.length === 0 ? (
              <div className={styles.tableEmpty}>
                <i className="ti ti-package" style={{ fontSize: 32, color: 'var(--text-muted)' }} />
                <p>No items yet. Use <strong>Stock in</strong> to add your first item.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Unit</th>
                      <th>Rate (UGX)</th>
                      <th>Qty</th>
                      <th>Total value</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.items.map(item => (
                      <tr key={item.id}>
                        <td className={styles.itemName}>{item.name}</td>
                        <td className={styles.mono}>{item.unit}</td>
                        <td className={styles.mono}>{fmt(item.rate)}</td>
                        <td className={styles.mono}>{fmt(item.quantity)}</td>
                        <td className={styles.mono}>{fmt(item.price)}</td>
                        <td>
                          {item.isLow ? (
                            <span className={styles.badgeLow}>Low</span>
                          ) : (
                            <span className={styles.badgeOk}>OK</span>
                          )}
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              className={styles.iconBtn}
                              title="Edit"
                              onClick={() => setModal({ edit: item })}
                            >
                              <i className="ti ti-edit" />
                            </button>
                            <button
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              title="Delete"
                              onClick={() => deleteItem(item.id)}
                              disabled={deletingId === item.id}
                            >
                              <i className="ti ti-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Transfer log tab ── */}
        {tab === 'transfers' && (
          <div className={styles.transferList}>
            {transfers.length === 0 ? (
              <div className={styles.tableEmpty}>
                <i className="ti ti-transfer" style={{ fontSize: 32, color: 'var(--text-muted)' }} />
                <p>No transfers yet involving this store.</p>
              </div>
            ) : (
              transfers.map(t => {
                const isOut = t.sourceStoreId === store.id
                return (
                  <div key={t.id} className={styles.transferRow}>
                    <div className={`${styles.transferDir} ${isOut ? styles.dirOut : styles.dirIn}`}>
                      <i className={`ti ${isOut ? 'ti-arrow-up-right' : 'ti-arrow-down-left'}`} />
                    </div>
                    <div className={styles.transferStores}>
                      <span className={styles.pill}>{t.sourceStore.name}</span>
                      <i className="ti ti-arrow-right" style={{ color: 'var(--text-muted)', fontSize: 13 }} />
                      <span className={styles.pill}>{t.targetStore.name}</span>
                      <span className={styles.transferCat}>
                        {t.sourceStore.category.name} → {t.targetStore.category.name}
                      </span>
                    </div>
                    <div className={styles.transferItem}>{t.itemName} · {t.unit}</div>
                    <div className={styles.transferQty}>{fmt(t.quantity)} units</div>
                    <div className={styles.transferTime}>{timeAgo(t.createdAt)}</div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'in' && (
        <StockInModal storeId={store.id} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'out' && (
        <StockOutModal store={store} allStores={allStores} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal?.edit && (
        <EditItemModal item={modal.edit} onClose={() => setModal(null)} onDone={refresh} />
      )}
    </>
  )
}
