'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconAlertCircle, IconArrowBarUp, IconBox, IconCoins, IconEdit, IconHistory, IconPackage, IconPlus, IconRuler2,
  IconSearch, IconTrash, IconBuildingBank,
} from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import EmptyState from '@/components/ui/EmptyState'
import ExportBar from '@/components/ui/ExportBar'
import ReportDocument from '@/components/ui/ReportDocument'
import { useConfirm } from '@/components/ConfirmProvider'
import StockMoveModal, { ISSUE_DESTINATIONS } from '@/dashboard/StockMoveModal'
import { api } from '@/lib/api'
import { fmtDate, fmtMoney, fmtNum, plural } from '@/lib/format'
import { withTotals } from '@/lib/tables'
import { exportExcel, exportPdf } from '@/lib/exporters'
import ui from '@/styles/ui.module.css'

const NEW_UNIT = '__new_unit__'

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

// The catalogue as it prints and exports (same columns as the table on screen)
const CATALOGUE_COLS = [
  { label: 'Product', value: p => p.name, strong: true },
  { label: 'Unit', value: p => p.unit.name, muted: true },
  { label: 'Opening qty', value: p => p.openingQty, num: true },
  { label: 'Rate (UGX)', value: p => p.openingRate, num: true },
  { label: 'Opening value (UGX)', value: p => p.openingQty * p.openingRate, num: true, total: true },
  { label: 'Not yet in a store', value: p => balancesOf(p).left, num: true },
  { label: 'Stores holding it', value: p => balancesOf(p).inStores, num: true },
  { label: 'Total qty', value: p => balancesOf(p).totalQty, num: true },
  { label: 'Total value (UGX)', value: p => balancesOf(p).totalValue, num: true, total: true },
]

// Opening qty + rate inputs with the amount worked out as you type
function OpeningFields({ qty, rate, onQty, onRate, hint }) {
  const amount = (parseFloat(qty) || 0) * (parseFloat(rate) || 0)
  return (
    <div className={ui.stack}>
      <span className={ui.sectionLabel}>Opening balance</span>
      <div className={ui.formRow2}>
        <Field label="Opening qty">
          <input type="number" min="0" inputMode="decimal" className={ui.input} value={qty} onChange={e => onQty(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Rate (UGX)">
          <input type="number" min="0" inputMode="decimal" className={ui.input} value={rate} onChange={e => onRate(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <span className={ui.hint}>
        Amount: <strong className={ui.strong}>{fmtMoney(amount)}</strong>. {hint ?? 'Treated as stock held from the start; issue it to a store, a project or an external party.'}
      </span>
    </div>
  )
}

function ErrorAlert({ message }) {
  if (!message) return null
  return (
    <div className={`${ui.alert} ${ui.alertDanger}`}>
      <IconAlertCircle size={17} />
      <span>{message}</span>
    </div>
  )
}

function NewProductModal({ units, isAdmin, onClose, onDone }) {
  const [name, setName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [openingQty, setOpeningQty] = useState('')
  const [openingRate, setOpeningRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Enter the product name.'); return }
    if (unitId === NEW_UNIT && !newUnit.trim()) { setError('Enter a name for the new unit.'); return }
    if (!unitId) { setError('Choose a unit, or "+ New unit".'); return }

    setSaving(true); setError('')
    try {
      let finalUnitId = unitId
      if (unitId === NEW_UNIT) finalUnitId = (await api('/api/units', { method: 'POST', body: { name: newUnit.trim() } })).id
      const body = { name: name.trim(), unitId: finalUnitId }
      if (isAdmin) {
        body.openingQty = parseFloat(openingQty) || 0
        body.openingRate = parseFloat(openingRate) || 0
      }
      const product = await api('/api/products', { method: 'POST', body })
      onDone(product)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="New product"
      subtitle="Added to the catalogue that every store uses"
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="new-product" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Adding…</> : 'Add product'}
          </button>
        </>
      )}
    >
      <form id="new-product" className={ui.form} onSubmit={submit}>
        <Field label="Product name" required>
          <input autoFocus className={ui.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cement 50kg" />
        </Field>
        <Field label="Unit" required asLabel={false}>
          <select className={ui.input} value={unitId} onChange={e => setUnitId(e.target.value)}>
            <option value="">Choose a unit…</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value={NEW_UNIT}>+ New unit…</option>
          </select>
          {unitId === NEW_UNIT && (
            <input autoFocus className={ui.input} value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="e.g. bag, litre, piece" />
          )}
        </Field>
        {isAdmin && <OpeningFields qty={openingQty} rate={openingRate} onQty={setOpeningQty} onRate={setOpeningRate} />}
        <ErrorAlert message={error} />
      </form>
    </Modal>
  )
}

function EditProductModal({ product, units, isAdmin, onClose, onDone }) {
  const [name, setName] = useState(product.name)
  const [unitId, setUnitId] = useState(product.unitId)
  const [openingQty, setOpeningQty] = useState(String(product.openingQty))
  const [openingRate, setOpeningRate] = useState(String(product.openingRate))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const issued = Math.max(product.openingQty - balancesOf(product).left, 0)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Enter the product name.'); return }
    setSaving(true); setError('')
    try {
      const body = { name: name.trim(), unitId }
      if (isAdmin) {
        body.openingQty = parseFloat(openingQty) || 0
        body.openingRate = parseFloat(openingRate) || 0
      }
      await api(`/api/products/${product.id}`, { method: 'PATCH', body })
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit product"
      subtitle={product.name}
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="edit-product" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : 'Save changes'}
          </button>
        </>
      )}
    >
      <form id="edit-product" className={ui.form} onSubmit={submit}>
        <Field label="Product name" required>
          <input autoFocus className={ui.input} value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label="Unit" required>
          <select className={ui.input} value={unitId} onChange={e => setUnitId(e.target.value)}>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        {isAdmin && (
          <OpeningFields
            qty={openingQty}
            rate={openingRate}
            onQty={setOpeningQty}
            onRate={setOpeningRate}
            hint={issued > 0 ? `${fmtNum(issued)} ${product.unit.name} has already been issued from it, so the opening qty can't go below that.` : undefined}
          />
        )}
        <ErrorAlert message={error} />
      </form>
    </Modal>
  )
}

// canEdit: false for Viewers, who see the catalogue and can print it but change nothing
export default function ProductsManager({ initialProducts, units, allStores, isAdmin, canEdit = true, settings }) {
  const router = useRouter()
  const { confirm, toast } = useConfirm()
  const [products, setProducts] = useState(initialProducts)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // 'new' | { edit } | { issue }

  async function reload() {
    const data = await api('/api/products').catch(() => null)
    if (Array.isArray(data)) setProducts(data)
    router.refresh()
  }

  async function deleteProduct(product) {
    const ok = await confirm({
      title: 'Delete product',
      message: `Delete ${product.name}? Only a product that has never been stocked or issued can be deleted; anything with history is kept.`,
      confirmLabel: 'Delete product',
      danger: true,
    })
    if (!ok) return
    try {
      await api(`/api/products/${product.id}`, { method: 'DELETE' })
      toast(`${product.name} deleted`)
      reload()
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  const q = query.trim().toLowerCase()
  const visible = products.filter(p => !q || p.name.toLowerCase().includes(q) || p.unit.name.toLowerCase().includes(q))
  const openingValue = products.reduce((s, p) => s + p.openingQty * p.openingRate, 0)
  const stockValue = products.reduce((s, p) => s + balancesOf(p).totalValue, 0)

  // Print / PDF / Excel follow the search box
  const catalogue = {
    title: 'Product catalogue',
    subtitle: [`As at ${fmtDate(new Date())}`, q && `Products matching "${query.trim()}"`].filter(Boolean).join(' · '),
    meta: [
      ['Products', fmtNum(visible.length)],
      ['Opening value', fmtMoney(visible.reduce((s, p) => s + p.openingQty * p.openingRate, 0))],
      ['Stock value', fmtMoney(visible.reduce((s, p) => s + balancesOf(p).totalValue, 0))],
    ],
    sections: withTotals([{ cols: CATALOGUE_COLS, rows: visible, empty: 'No products match the search.' }]),
  }
  const exportArgs = { ...catalogue, settings, fileBase: q ? 'product-catalogue-filtered' : 'product-catalogue' }

  // StockMoveModal expects a store with items; the opening balance is presented as one
  const issuing = modal?.issue
  const issuingStore = issuing && (() => {
    const { opening } = balancesOf(issuing)
    return {
      id: opening.storeId,
      name: 'Opening balance',
      items: [{ id: opening.id, productId: issuing.id, name: issuing.name, unit: issuing.unit.name, owner: '—', rate: opening.rate, quantity: opening.quantity }],
    }
  })()

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="The master catalogue shared by every store, with opening balances"
        actions={(
          <>
            {isAdmin && (
              <Link href="/lists?tab=units" className={`${ui.btn} ${ui.btnSecondary}`}>
                <IconRuler2 size={17} /> Manage units
              </Link>
            )}
            {canEdit && (
              <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setModal('new')}>
                <IconPlus size={17} /> New product
              </button>
            )}
          </>
        )}
      />

      <div className={ui.page}>
        <div className={`${ui.grid} ${ui.cols4}`} data-no-print>
          <StatCard icon={IconPackage} tone="info" label="Products" value={fmtNum(products.length)} hint="In the catalogue" />
          <StatCard icon={IconBuildingBank} tone="brand" label="Opening balances" value={fmtMoney(openingValue)} hint="Qty × rate as entered" />
          <StatCard icon={IconCoins} tone="success" label="Stock value" value={fmtMoney(stockValue)} hint="All stores and opening balances" />
          <StatCard icon={IconRuler2} tone="teal" label="Units" value={fmtNum(units.length)} hint="kg, bag, litre…" />
        </div>

        {products.length > 0 && (
          <ExportBar
            info={<strong className={ui.strong}>{visible.length === products.length ? plural(products.length, 'product') : `${visible.length} of ${products.length} products`}</strong>}
            onPdf={() => exportPdf(exportArgs)}
            onExcel={() => exportExcel(exportArgs)}
          />
        )}

        <div className={ui.printOnly}>
          <ReportDocument {...catalogue} settings={settings} />
        </div>

        <section className={`${ui.card} ${ui.cardFlush}`} data-no-print>
          {products.length === 0 ? (
            <EmptyState
              icon={IconBox}
              title="No products yet"
              action={canEdit ? <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setModal('new')}><IconPlus size={17} /> New product</button> : null}
            >
              Products are created once here and then used by every store.
            </EmptyState>
          ) : (
            <>
              <div className={ui.toolbar}>
                <div className={`${ui.inputWrap} ${ui.toolbarSearch}`}>
                  <span className={ui.inputIcon}><IconSearch size={16} /></span>
                  <input className={`${ui.input} ${ui.inputSm} ${ui.inputWithIcon}`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products…" aria-label="Search products" />
                </div>
                <span className={ui.spacer} />
                <span className={ui.hint}>{visible.length === products.length ? plural(products.length, 'product') : `${visible.length} of ${products.length} products`}</span>
              </div>
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit</th>
                      <th className={ui.num}>Opening qty</th>
                      <th className={ui.num}>Rate (UGX)</th>
                      <th className={ui.num}>Opening value</th>
                      <th className={ui.num} title="Opening balance not yet issued to a store">Not yet in a store</th>
                      <th className={ui.num} title="How many stores hold it">In stores</th>
                      <th className={ui.num}>Total qty</th>
                      <th className={ui.num}>Total value</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(p => {
                      const b = balancesOf(p)
                      return (
                        <tr key={p.id}>
                          <td className={ui.cellStrong}>{p.name}</td>
                          <td className={ui.cellMuted}>{p.unit.name}</td>
                          <td className={ui.num}>{fmtNum(p.openingQty)}</td>
                          <td className={ui.num}>{fmtNum(p.openingRate)}</td>
                          <td className={ui.num}>{fmtNum(p.openingQty * p.openingRate)}</td>
                          <td className={ui.num}>{fmtNum(b.left)}</td>
                          <td className={ui.num}>{fmtNum(b.inStores)}</td>
                          <td className={`${ui.num} ${ui.strong}`}>{fmtNum(b.totalQty)}</td>
                          <td className={ui.num}>{fmtNum(b.totalValue)}</td>
                          <td>
                            <div className={ui.cellActions}>
                              {canEdit && b.left > 0 && (
                                <button type="button" className={ui.iconBtn} title="Issue from the opening balance" onClick={() => setModal({ issue: p })}>
                                  <IconArrowBarUp size={17} />
                                </button>
                              )}
                              <Link href={`/search?product=${p.id}`} className={ui.iconBtn} title="History">
                                <IconHistory size={17} />
                              </Link>
                              {canEdit && (
                                <>
                                  <button type="button" className={ui.iconBtn} title="Edit" onClick={() => setModal({ edit: p })}>
                                    <IconEdit size={17} />
                                  </button>
                                  <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Delete" onClick={() => deleteProduct(p)}>
                                    <IconTrash size={17} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {visible.length === 0 && (
                      <tr><td colSpan={10} className={ui.tableEmpty}>No products match &quot;{query.trim()}&quot;.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {modal === 'new' && (
        <NewProductModal
          units={units}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onDone={product => { setModal(null); toast(`${product.name} added to the catalogue`); reload() }}
        />
      )}
      {modal?.edit && (
        <EditProductModal
          product={modal.edit}
          units={units}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); toast('Product updated'); reload() }}
        />
      )}
      {issuingStore && (
        <StockMoveModal
          title="Issue from opening balance"
          destinations={ISSUE_DESTINATIONS}
          store={issuingStore}
          allStores={allStores}
          initialItemId={issuingStore.items[0].id}
          allowNext={false}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); reload() }}
        />
      )}
    </>
  )
}
