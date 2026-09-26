'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ConfirmProvider'
import { apiFetch } from '@/lib/apiFetch'
import styles from './store.module.css'

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n) {
  return Number(n).toLocaleString()
}

function timeAgo(date) {
  const d = new Date(date)
  const diff = (Date.now() - d) / 1000

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'yesterday'

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

// ── Stock In Modal ─────────────────────────────────────────────────────────
// One ref no. and date for the whole receipt, followed by as many item lines as needed
let lineKey = 0
function blankLine() {
  return { key: ++lineKey, productId: '', rate: '', quantity: '', lowStockAt: '' }
}

function isFilled(line) {
  return line.productId || line.rate !== '' || line.quantity !== ''
}

function StockInModal({ storeId, onClose, onDone }) {
  const router = useRouter()
  const todayStr = new Date().toISOString().slice(0, 10)
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [knownRefs, setKnownRefs] = useState([])
  const [refNo, setRefNo] = useState('')
  const [entryDate, setEntryDate] = useState(todayStr)
  const [lines, setLines] = useState(() => [blankLine()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false))
    fetch('/api/receipts')
      .then(res => res.json())
      .then(data => setKnownRefs(Array.isArray(data) ? data.map(r => r.refNo) : []))
      .catch(() => setKnownRefs([]))
  }, [])

  const refExists = refNo.trim() !== '' && knownRefs.includes(refNo.trim())
  const filledCount = lines.filter(isFilled).length
  const total = lines.reduce((s, l) => s + (parseFloat(l.rate) || 0) * (parseFloat(l.quantity) || 0), 0)

  function setLine(key, field, val) {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, [field]: val } : l)))
  }

  function removeLine(key) {
    setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls))
  }

  // keepOpen: clear the lines and ref no. afterwards so the next receipt can be entered
  async function submit(keepOpen) {
    const filled = lines.filter(isFilled)
    if (filled.length === 0) { setError('Add at least one item.'); return }
    const bad = filled.find(l => !l.productId || l.rate === '' || parseFloat(l.rate) < 0 || !(parseFloat(l.quantity) > 0))
    if (bad) {
      setError(`Line ${lines.indexOf(bad) + 1}: select a product, and enter a rate (0 or more) and a quantity greater than 0.`)
      return
    }
    if (!entryDate) { setError('Select a date.'); return }

    setLoading(true); setError(''); setSaved('')
    try {
      const res = await apiFetch(`/api/stores/${storeId}/stock-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refNo: refNo.trim() || null,
          entryDate,
          items: filled.map(l => ({
            productId: l.productId,
            rate: parseFloat(l.rate),
            quantity: parseFloat(l.quantity),
            // Left blank keeps the item's existing low-stock alert
            lowStockAt: l.lowStockAt === '' ? null : parseFloat(l.lowStockAt),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (!keepOpen) { onDone(); return }

      setSaved(`Saved ${data.count} item${data.count === 1 ? '' : 's'}${data.refNo ? ` under ${data.refNo}` : ''}. Enter the next ref no.`)
      if (data.refNo) setKnownRefs(r => [...r, data.refNo])
      setRefNo('')
      setLines([blankLine()])
      setLoading(false)
      router.refresh()
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.modalHeader}>
          <h3>Stock in</h3>
          <button className={styles.closeBtn} onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Ref no.</label>
              <input
                autoFocus
                value={refNo}
                onChange={e => { setRefNo(e.target.value); setSaved('') }}
                placeholder="e.g. RCT-1234 (optional)"
              />
            </div>
            <div className={styles.field}>
              <label>Date</label>
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} max={todayStr} />
            </div>
          </div>
          <span className={styles.fieldHint}>
            {refExists
              ? <>Ref no. <strong>{refNo.trim()}</strong> already has entries. These items will be added to it.</>
              : 'The ref no. and date apply to every item below.'}
          </span>

          <div className={styles.tableWrap} style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Rate (UGX)</th>
                  <th>Qty</th>
                  <th>Low at</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key} className={styles.addRow}>
                    <td className={styles.mono}>{i + 1}</td>
                    <td style={{ minWidth: 180 }}>
                      <select
                        value={l.productId}
                        onChange={e => setLine(l.key, 'productId', e.target.value)}
                        disabled={loadingProducts}
                        className={styles.inlineSelect}
                      >
                        <option value="">{loadingProducts ? 'Loading…' : '— select product —'}</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.unit.name})</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number" min="0" placeholder="Rate"
                        value={l.rate} onChange={e => setLine(l.key, 'rate', e.target.value)}
                        className={styles.inlineInputSmall}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" placeholder="Qty"
                        value={l.quantity} onChange={e => setLine(l.key, 'quantity', e.target.value)}
                        className={styles.inlineInputSmall}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" placeholder="Optional"
                        value={l.lowStockAt} onChange={e => setLine(l.key, 'lowStockAt', e.target.value)}
                        className={styles.inlineInputSmall}
                      />
                    </td>
                    <td className={styles.mono}>{fmt((parseFloat(l.rate) || 0) * (parseFloat(l.quantity) || 0))}</td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        title="Remove line"
                        onClick={() => removeLine(l.key)}
                        disabled={lines.length === 1}
                      >
                        <i className="ti ti-x" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <button type="button" className={styles.btnGhost} onClick={() => setLines(ls => [...ls, blankLine()])}>
              <i className="ti ti-plus" /> Add item
            </button>
            <span className={styles.mono}>Total: UGX {fmt(total)}</span>
          </div>

          {!loadingProducts && products.length === 0 && (
            <p className={styles.fieldHint}>No products yet — create one in the Products section first.</p>
          )}
          {saved && <p className={styles.fieldHint} style={{ color: 'var(--success)' }}>{saved}</p>}
          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnGhost} onClick={onClose}>{saved ? 'Close' : 'Cancel'}</button>
          <button className={styles.btnGhost} onClick={() => submit(true)} disabled={loading}>
            Save &amp; next ref no.
          </button>
          <button className={styles.btnPrimary} onClick={() => submit(false)} disabled={loading}>
            {loading ? 'Saving…' : filledCount > 0 ? `Save ${filledCount} item${filledCount === 1 ? '' : 's'}` : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stock Out (Transfer) Modal ─────────────────────────────────────────────
const NEW_RECIPIENT_VALUE = '__new_recipient__'

// Also used by Manage Products to issue from the opening balance
export function StockOutModal({ store, allStores, onClose, onDone, initialItemId = '' }) {
  const [mode, setMode] = useState('store') // 'store' | 'external'
  const [selectedItemId, setSelectedItemId] = useState(initialItemId)
  const [targetStoreId, setTargetStoreId] = useState('')
  const [recipients, setRecipients] = useState([])
  const [recipientId, setRecipientId] = useState('')
  const [newRecipientName, setNewRecipientName] = useState('')
  const [newRecipientCompany, setNewRecipientCompany] = useState('')
  const [quantity, setQuantity] = useState('')
  const [entryDate, setEntryDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]
  useEffect(() => {
    fetch('/api/recipients')
      .then(res => res.json())
      .then(data => setRecipients(Array.isArray(data) ? data : []))
      .catch(() => setRecipients([]))
  }, [])

  const selectedItem = store.items.find(i => i.id === selectedItemId)

  async function submit() {
    // if (!selectedItemId || !quantity) {
    //   setError('Item and quantity are required.'); return
    // }
    if (!selectedItemId || !quantity || !entryDate) {
      setError('Item, quantity, and date are required.'); return
    }
    if (mode === 'store' && !targetStoreId) {
      setError('Select a destination store.'); return
    }
    if (mode === 'external' && !recipientId) {
      setError('Select a recipient, or choose "+ New recipient".'); return
    }
    if (mode === 'external' && recipientId === NEW_RECIPIENT_VALUE && !newRecipientName.trim()) {
      setError('Enter the recipient\'s name.'); return
    }
    if (parseFloat(quantity) > selectedItem?.quantity) {
      setError(`Only ${selectedItem.quantity} ${selectedItem.unit} available.`); return
    }

    setLoading(true); setError('')
    try {
      let finalRecipientId = recipientId

      if (mode === 'external' && recipientId === NEW_RECIPIENT_VALUE) {
        const rRes = await fetch('/api/recipients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newRecipientName.trim(), company: newRecipientCompany.trim() }),
        })
        const rData = await rRes.json()
        if (!rRes.ok) throw new Error(rData.error || 'Unable to create recipient')
        finalRecipientId = rData.id
      }

      const body = {
        sourceStoreId: store.id,
        productId: selectedItem.productId,
        quantity: parseFloat(quantity),
        entryDate: entryDate || undefined, 
      }
      if (mode === 'store') body.targetStoreId = targetStoreId
      else body.recipientId = finalRecipientId

      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
          <h3>Stock out</h3>
          <button className={styles.closeBtn} onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Source store</label>
            <input value={store.name} disabled className={styles.disabledInput} />
          </div>

          <div className={styles.field}>
            <label>Send to</label>
            <select value={mode} onChange={e => { setMode(e.target.value); setTargetStoreId(''); setRecipientId('') }}>
              <option value="store">Another store</option>
              <option value="external">External party</option>
            </select>
          </div>

          {mode === 'store' ? (
            <div className={styles.field}>
              <label>Target store</label>
              <select value={targetStoreId} onChange={e => setTargetStoreId(e.target.value)}>
                <option value="">— select destination —</option>
                {allStores.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.categoryName})</option>
                ))}
              </select>
            </div>
          ) : (
            <div className={styles.field}>
              <label>Recipient</label>
              <select value={recipientId} onChange={e => setRecipientId(e.target.value)}>
                <option value="">— select recipient —</option>
                {recipients.map(r => (
                  <option key={r.id} value={r.id}>{r.name}{r.company ? ` (${r.company})` : ''}</option>
                ))}
                <option value={NEW_RECIPIENT_VALUE}>+ New recipient…</option>
              </select>
              {recipientId === NEW_RECIPIENT_VALUE && (
                <div className={styles.fieldRow} style={{ marginTop: 8 }}>
                  <input
                    autoFocus
                    value={newRecipientName}
                    onChange={e => setNewRecipientName(e.target.value)}
                    placeholder="Recipient name"
                  />
                  <input
                    value={newRecipientCompany}
                    onChange={e => setNewRecipientCompany(e.target.value)}
                    placeholder="Company (optional)"
                  />
                </div>
              )}
            </div>
          )}

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
          <div className={styles.field}>
            <label>Date</label>
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} max={todayStr} />
          </div>

          <div className={styles.transferNote}>
            <i className="ti ti-info-circle" />
            {mode === 'store'
              ? <>Stock will be reduced from <strong>{store.name}</strong> and added to the destination store.</>
              : <>Stock will be reduced from <strong>{store.name}</strong> and marked as issued to the recipient. It will no longer be tracked in any store.</>
            }
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnGhost} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={submit} disabled={loading}>
            {loading ? 'Sending…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Item Modal ────────────────────────────────────────────────────────
function EditItemModal({ item, onClose, onDone }) {
  const [form, setForm] = useState({
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
      const res = await apiFetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
            <label>Product</label>
            <input value={`${item.name} (${item.unit})`} disabled className={styles.disabledInput} />
            <span className={styles.fieldHint}>
              To rename this product or change its unit, edit it in the Products section.
            </span>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Rate (UGX per {item.unit})</label>
              <input type="number" value={form.rate} onChange={e => set('rate', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Quantity</label>
              <input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label>Low stock alert at</label>
            <input type="number" value={form.lowStockAt} onChange={e => set('lowStockAt', e.target.value)} />
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
export default function StoreDashboard({ store, allStores, transfers, currentUser }) {
  const router = useRouter()
  const { confirm, notify } = useConfirm()
  const [tab, setTab] = useState('inventory')
  const [modal, setModal] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const canDelete = currentUser?.role === 'SUPER_ADMIN'

  async function restoreItem(id) {
    await fetch(`/api/items/${id}/restore`, {
      method: 'POST',
    })

    router.refresh()
  }

  function refresh() {
    setModal(null)
    router.refresh()
  }

  async function deleteItem(id) {
    const ok = await confirm('Remove this item from the store?')
    if (!ok) return
    setDeletingId(id)
    await apiFetch(`/api/items/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    router.refresh()
  }

  async function permanentlyDeleteItem(id) {
    const ok = await confirm('Permanently delete this item? This cannot be undone and history for it will be lost.')
    if (!ok) return
    const res = await apiFetch(`/api/items/${id}/permanent`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      notify(data.error || 'Failed to permanently delete item.')
      return
    }
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
        <div className={styles.tabs}>
        {canDelete && (
          <button className={`${styles.tab} ${tab === 'deleted' ? styles.tabActive : ''}`} onClick={() => setTab('deleted')}>
            Deleted items
            {store.deletedItems?.length > 0 && <span className={styles.tabBadge}>{store.deletedItems.length}</span>}
          </button>
        )}
        </div>
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
                      <th>Added</th>
                      <th>Deducted</th>
                      <th>Balance</th>
                      <th>Total value</th>
                      <th>Status</th>
                      <th>Last updated</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.items.map(item => (
                      <tr key={item.id}>
                        <td className={styles.itemName}>{item.name}</td>
                        <td className={styles.mono}>{item.unit}</td>
                        <td className={styles.mono}>{fmt(item.rate)}</td>
                        <td className={styles.mono}>{fmt(item.totalAdded)}</td>
                        <td className={styles.mono}>{fmt(item.totalDeducted)}</td>
                        <td className={styles.mono}>{fmt(item.quantity)}</td>
                        <td className={styles.mono}>{fmt(item.price)}</td>
                        <td>
                          {item.isLow ? (
                            <span className={styles.badgeLow}>Low</span>
                          ) : (
                            <span className={styles.badgeOk}>OK</span>
                          )}
                        </td>
                        <td className={styles.mono}>{timeAgo(item.createdAt)}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <button
                              className={styles.iconBtn}
                              title="Edit"
                              onClick={() => setModal({ edit: item })}
                            >
                              <i className="ti ti-edit" />
                            </button>
                            
                            {/* Delete — SUPER_ADMIN only */}
                            {canDelete && (
                              <button
                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                title="Delete"
                                onClick={() => deleteItem(item.id)}
                                disabled={deletingId === item.id}
                              >
                                <i className="ti ti-trash" />
                              </button>
                            )}
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
                const destinationLabel = t.targetStore
                ? t.targetStore.name
                : t.recipient
                  ? `${t.recipient.name}${t.recipient.company ? ` (${t.recipient.company})` : ''}`
                  : 'Unknown'
                const destinationCat = t.targetStore ? t.targetStore.category.name : 'External'
                return (
                  <div key={t.id} className={styles.transferRow}>
                    <div className={`${styles.transferDir} ${isOut ? styles.dirOut : styles.dirIn}`}>
                      <i className={`ti ${isOut ? 'ti-arrow-up-right' : 'ti-arrow-down-left'}`} />
                    </div>
                    <div className={styles.transferStores}>
                      <span className={styles.pill}>{t.sourceStore.name}</span>
                      <i className="ti ti-arrow-right" style={{ color: 'var(--text-muted)', fontSize: 13 }} />
                      <span className={styles.pill}>{destinationLabel}</span>
                      <span className={styles.transferCat}>
                        {t.sourceStore.category.name} → {destinationCat}
                      </span>
                    </div>
                    <div className={styles.transferItem}>{t.product.name} · {t.product.unit.name}</div>
                    <div className={styles.transferQty}>{fmt(t.quantity)} units</div>
                    <div className={styles.transferTime}>{timeAgo(t.createdAt)}</div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── Deleted items tab ── */}
        {tab === 'deleted' && canDelete && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unit</th>
                  <th>Qty (at deletion)</th>
                  <th>Deleted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {store.deletedItems?.map(entry => (
                  <tr key={entry.id}>
                    <td className={styles.itemName}>{entry.product.name}</td>
                    <td className={styles.mono}>{entry.product.unit.name}</td>
                    <td className={styles.mono}>{fmt(entry.quantity)}</td>
                    <td className={styles.fieldHint}>{timeAgo(entry.deletedAt)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button className={styles.btnGhost} onClick={() => restoreItem(entry.id)}>
                          Restore
                        </button>
                        <button
                          className={`${styles.btnGhost} ${styles.iconBtnDanger}`}
                          onClick={() => permanentlyDeleteItem(entry.id)}
                        >
                          Delete permanently
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!store.deletedItems || store.deletedItems.length === 0) && (
                  <tr><td colSpan={5} className={styles.fieldHint}>No deleted items.</td></tr>
                )}
              </tbody>
            </table>
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