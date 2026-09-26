'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ConfirmProvider'
import { StockOutModal } from '@/dashboard/StoreDashboard'
import styles from '@/dashboard/store.module.css'

const NEW_UNIT_VALUE = '__new_unit__'

function fmt(n) {
  return Number(n).toLocaleString()
}

// Opening entry = the product's stock in the hidden opening-balance store
function balancesOf(product) {
  const opening = product.entries.find(e => e.store.category.isSystem)
  return {
    opening,
    left: opening?.quantity ?? 0,
    inStores: product.entries.filter(e => !e.store.category.isSystem).length,
    totalQty: product.entries.reduce((s, e) => s + e.quantity, 0),
    totalValue: product.entries.reduce((s, e) => s + e.quantity * e.rate, 0),
  }
}

// Opening qty + rate inputs with the amount worked out as you type
function OpeningFields({ qty, rate, onQty, onRate }) {
  const amount = (parseFloat(qty) || 0) * (parseFloat(rate) || 0)
  return (
    <>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label>Opening qty</label>
          <input type="number" min="0" value={qty} onChange={e => onQty(e.target.value)} placeholder="0" />
        </div>
        <div className={styles.field}>
          <label>Rate (UGX)</label>
          <input type="number" min="0" value={rate} onChange={e => onRate(e.target.value)} placeholder="0" />
        </div>
      </div>
      <span className={styles.fieldHint}>Amount: UGX {fmt(amount)}</span>
    </>
  )
}

function EditProductModal({ product, units, isAdmin, onClose, onDone }) {
  const [name, setName] = useState(product.name)
  const [unitId, setUnitId] = useState(product.unitId)
  const [openingQty, setOpeningQty] = useState(String(product.openingQty))
  const [openingRate, setOpeningRate] = useState(String(product.openingRate))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { left } = balancesOf(product)
  const issued = Math.max(product.openingQty - left, 0)

  async function submit() {
    if (!name.trim()) { setError('Product name is required.'); return }
    setLoading(true); setError('')
    try {
      const body = { name: name.trim(), unitId }
      if (isAdmin) {
        body.openingQty = parseFloat(openingQty) || 0
        body.openingRate = parseFloat(openingRate) || 0
      }
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to update product')
      onDone()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>Edit product</h3>
          <button className={styles.closeBtn} onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label>Product name</label>
            <input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Unit</label>
            <select value={unitId} onChange={e => setUnitId(e.target.value)}>
              {units.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div className={styles.field}>
              <OpeningFields qty={openingQty} rate={openingRate} onQty={setOpeningQty} onRate={setOpeningRate} />
              {issued > 0 && (
                <span className={styles.fieldHint}>
                  {fmt(issued)} {product.unit.name} already issued from the opening balance, so opening qty can&apos;t go below that.
                </span>
              )}
            </div>
          )}
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

export default function ProductsManager({ initialProducts, initialUnits, allStores, isAdmin }) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const [products, setProducts] = useState(initialProducts)
  const [units, setUnits] = useState(initialUnits)

  const [name, setName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [newUnitName, setNewUnitName] = useState('')
  const [openingQty, setOpeningQty] = useState('')
  const [openingRate, setOpeningRate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [issuing, setIssuing] = useState(null)

  async function refreshAll() {
    const [pRes, uRes] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/units'),
    ])
    const [p, u] = await Promise.all([pRes.json(), uRes.json()])
    if (Array.isArray(p)) setProducts(p)
    if (Array.isArray(u)) setUnits(u)
    router.refresh()
  }

  async function submitProduct(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Product name is required.'); return }

    const creatingNewUnit = unitId === NEW_UNIT_VALUE
    if (creatingNewUnit && !newUnitName.trim()) {
      setError('Enter a name for the new unit.'); return
    }
    if (!creatingNewUnit && !unitId) {
      setError('Select a unit, or choose "+ New unit".'); return
    }

    setLoading(true); setError('')
    try {
      let finalUnitId = unitId

      if (creatingNewUnit) {
        const uRes = await fetch('/api/units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newUnitName.trim() }),
        })
        const uData = await uRes.json()
        if (!uRes.ok) throw new Error(uData.error || 'Unable to create unit')
        finalUnitId = uData.id
      }

      const body = { name: name.trim(), unitId: finalUnitId }
      if (isAdmin) {
        body.openingQty = parseFloat(openingQty) || 0
        body.openingRate = parseFloat(openingRate) || 0
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to create product')

      setName('')
      setUnitId('')
      setNewUnitName('')
      setOpeningQty('')
      setOpeningRate('')
      await refreshAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteProduct(id) {
    const ok = await confirm('Delete this product? It must not be in any store inventory.')
    if (!ok) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to delete product')
      await refreshAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // StockOutModal expects a store with items; the opening balance is presented as one
  const issuingStore = issuing && (() => {
    const { opening } = balancesOf(issuing)
    return {
      id: opening.storeId,
      name: 'Opening balance',
      items: [{
        id: opening.id,
        productId: issuing.id,
        name: issuing.name,
        unit: issuing.unit.name,
        quantity: opening.quantity,
      }],
    }
  })()

  return (
    <>
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h2 className={styles.storeName}>Products</h2>
          <span className={styles.storeMeta}>Master catalogue — shared across all stores</span>
        </div>
      </div>

      <div className={styles.content}>
        <form className={styles.field} onSubmit={submitProduct} style={{ marginBottom: 24, maxWidth: 480 }}>
          <label>Create Product Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Book" />

          <label style={{ marginTop: 12 }}>Unit</label>
          <select value={unitId} onChange={e => setUnitId(e.target.value)}>
            <option value="">— select unit —</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
            <option value={NEW_UNIT_VALUE}>+ New unit…</option>
          </select>

          {unitId === NEW_UNIT_VALUE && (
            <input
              autoFocus
              style={{ marginTop: 8 }}
              value={newUnitName}
              onChange={e => setNewUnitName(e.target.value)}
              placeholder="e.g. kg, litre, bag"
            />
          )}

          {isAdmin && (
            <div style={{ marginTop: 12 }}>
              <OpeningFields qty={openingQty} rate={openingRate} onQty={setOpeningQty} onRate={setOpeningRate} />
            </div>
          )}

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button type="submit" className={styles.btnPrimary} disabled={loading} style={{ marginTop: 12 }}>
            {loading ? 'Adding…' : 'Add product'}
          </button>
        </form>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Unit</th>
                <th>Opening qty</th>
                <th>Rate (UGX)</th>
                <th>Amount</th>
                <th>Opening left</th>
                <th>In use</th>
                <th>Total qty</th>
                <th>Total value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const b = balancesOf(p)
                return (
                  <tr key={p.id}>
                    <td className={styles.itemName}>{p.name}</td>
                    <td className={styles.mono}>{p.unit.name}</td>
                    <td className={styles.mono}>{fmt(p.openingQty)}</td>
                    <td className={styles.mono}>{fmt(p.openingRate)}</td>
                    <td className={styles.mono}>{fmt(p.openingQty * p.openingRate)}</td>
                    <td className={styles.mono}>{fmt(b.left)}</td>
                    <td className={styles.mono}>{b.inStores} store{b.inStores === 1 ? '' : 's'}</td>
                    <td className={styles.mono}>{fmt(b.totalQty)}</td>
                    <td className={styles.mono}>{fmt(b.totalValue)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        {b.left > 0 && (
                          <button
                            className={styles.iconBtn}
                            title="Issue from opening balance"
                            onClick={() => setIssuing(p)}
                            disabled={loading}
                          >
                            <i className="ti ti-arrow-bar-up" />
                          </button>
                        )}
                        <button
                          className={styles.iconBtn}
                          title="Edit"
                          onClick={() => setEditing(p)}
                          disabled={loading}
                        >
                          <i className="ti ti-edit" />
                        </button>
                        <button
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          title="Delete"
                          onClick={() => deleteProduct(p.id)}
                          disabled={loading}
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {products.length === 0 && (
                <tr><td colSpan={10} className={styles.fieldHint}>No products yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditProductModal
          product={editing}
          units={units}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); refreshAll() }}
        />
      )}

      {issuingStore && (
        <StockOutModal
          store={issuingStore}
          allStores={allStores}
          initialItemId={issuingStore.items[0].id}
          onClose={() => setIssuing(null)}
          onDone={() => { setIssuing(null); refreshAll() }}
        />
      )}
    </>
  )
}
