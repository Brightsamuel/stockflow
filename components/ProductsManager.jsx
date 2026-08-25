'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/dashboard/store.module.css'

const NEW_UNIT_VALUE = '__new_unit__'

export default function ProductsManager({ initialProducts, initialUnits }) {
  const router = useRouter()
  const [products, setProducts] = useState(initialProducts)
  const [units, setUnits] = useState(initialUnits)

  const [name, setName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [newUnitName, setNewUnitName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), unitId: finalUnitId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to create product')

      setName('')
      setUnitId('')
      setNewUnitName('')
      await refreshAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product? It must not be in any store inventory.')) return
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
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Maize" />

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
                <th>In use</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td className={styles.itemName}>{p.name}</td>
                  <td className={styles.mono}>{p.unit.name}</td>
                  <td className={styles.mono}>{p._count.entries} store{p._count.entries === 1 ? '' : 's'}</td>
                  <td>
                    <button
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      title="Delete"
                      onClick={() => deleteProduct(p.id)}
                      disabled={loading}
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={4} className={styles.fieldHint}>No products yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}