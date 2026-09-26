'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ConfirmProvider'
import { apiFetch } from '@/lib/apiFetch'
import { NO_OWNER } from '@/lib/owners'
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

// Whether a ref no. is already in use, checked as the user types
function useRefExists(refNo) {
  const [existing, setExisting] = useState(null)
  useEffect(() => {
    const ref = refNo.trim()
    if (!ref) return undefined
    const timer = setTimeout(() => {
      fetch(`/api/receipts?q=${encodeURIComponent(ref)}`)
        .then(res => res.json())
        .then(data => setExisting(Array.isArray(data) && data.some(r => r.refNo === ref) ? ref : null))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [refNo])
  return refNo.trim() !== '' && existing === refNo.trim()
}

// Creates a record through a list API (owners, projects, recipients) and returns its id
async function createRecord(url, body, fallbackMessage) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || fallbackMessage)
  return data
}

const NEW_OWNER_VALUE = '__new_owner__'

function StockInModal({ storeId, onClose, onDone }) {
  const router = useRouter()
  const todayStr = new Date().toISOString().slice(0, 10)
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [owners, setOwners] = useState([])
  const [ownerId, setOwnerId] = useState('')
  const [newOwnerName, setNewOwnerName] = useState('')
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
    fetch('/api/owners')
      .then(res => res.json())
      .then(data => setOwners(Array.isArray(data) ? data : []))
      .catch(() => setOwners([]))
  }, [])

  const refExists = useRefExists(refNo)
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
    if (ownerId === NEW_OWNER_VALUE && !newOwnerName.trim()) { setError('Enter the new owner\'s name.'); return }

    setLoading(true); setError(''); setSaved('')
    try {
      let finalOwnerId = ownerId || null
      if (ownerId === NEW_OWNER_VALUE) {
        const owner = await createRecord('/api/owners', { name: newOwnerName.trim() }, 'Unable to create owner')
        setOwners(list => [...list, owner].sort((a, b) => a.name.localeCompare(b.name)))
        setOwnerId(owner.id)
        setNewOwnerName('')
        finalOwnerId = owner.id
      }

      const res = await apiFetch(`/api/stores/${storeId}/stock-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refNo: refNo.trim() || null,
          entryDate,
          ownerId: finalOwnerId,
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
          <div className={styles.fieldRow} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
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
            <div className={styles.field}>
              <label>Stock owner</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)}>
                <option value="">— none —</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
                <option value={NEW_OWNER_VALUE}>+ New owner…</option>
              </select>
              {ownerId === NEW_OWNER_VALUE && (
                <input
                  autoFocus
                  value={newOwnerName}
                  onChange={e => setNewOwnerName(e.target.value)}
                  placeholder="Owner name"
                />
              )}
            </div>
          </div>
          <span className={styles.fieldHint}>
            {refExists
              ? <>Ref no. <strong>{refNo.trim()}</strong> already has entries. These items will be added to it.</>
              : 'The ref no., date and owner apply to every item below.'}
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

// ── Transfer / Stock out Modal ─────────────────────────────────────────────
// Same layout as Stock in: one ref no., date and destination, then item lines.
// Transfer moves stock to another store; Stock out takes it out of the inventory
// as used (project / field) or issued (external party).
const NEW_RECIPIENT_VALUE = '__new_recipient__'
const NEW_PROJECT_VALUE = '__new_project__'

const DESTINATION_LABEL = {
  store: 'Another store',
  project: 'Project (field use)',
  external: 'External party',
}

const TRANSFER_DESTINATIONS = ['store']
const STOCK_OUT_DESTINATIONS = ['project', 'external']
export const ISSUE_DESTINATIONS = ['store', 'project', 'external']

function blankMoveLine(entryId = '') {
  return { key: ++lineKey, entryId, quantity: '' }
}

// Also used by Manage Products to issue from the opening balance
export function StockMoveModal({ title, destinations, store, allStores, onClose, onDone, initialItemId = '', allowNext = true }) {
  const router = useRouter()
  const todayStr = new Date().toISOString().slice(0, 10)
  const [destType, setDestType] = useState(destinations[0])
  const [targetStoreId, setTargetStoreId] = useState('')
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectLocation, setNewProjectLocation] = useState('')
  const [recipients, setRecipients] = useState([])
  const [recipientId, setRecipientId] = useState('')
  const [newRecipientName, setNewRecipientName] = useState('')
  const [newRecipientCompany, setNewRecipientCompany] = useState('')
  const [refNo, setRefNo] = useState('')
  const [entryDate, setEntryDate] = useState(todayStr)
  const [lines, setLines] = useState(() => [blankMoveLine(initialItemId)])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const needsProjects = destinations.includes('project')
  const needsRecipients = destinations.includes('external')
  useEffect(() => {
    if (needsProjects) {
      fetch('/api/projects')
        .then(res => res.json())
        .then(data => setProjects(Array.isArray(data) ? data : []))
        .catch(() => setProjects([]))
    }
    if (needsRecipients) {
      fetch('/api/recipients')
        .then(res => res.json())
        .then(data => setRecipients(Array.isArray(data) ? data : []))
        .catch(() => setRecipients([]))
    }
  }, [needsProjects, needsRecipients])

  const refExists = useRefExists(refNo)
  const itemsById = Object.fromEntries(store.items.map(i => [i.id, i]))
  const filled = lines.filter(l => l.entryId || l.quantity !== '')
  const total = lines.reduce((s, l) => s + (itemsById[l.entryId]?.rate ?? 0) * (parseFloat(l.quantity) || 0), 0)

  function setLine(key, field, val) {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, [field]: val } : l)))
  }

  function removeLine(key) {
    setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls))
  }

  function itemLabel(item) {
    const owner = item.owner && item.owner !== '—' ? ` · ${item.owner}` : ''
    return `${item.name}${owner} — ${fmt(item.quantity)} ${item.unit} available`
  }

  async function submit(keepOpen) {
    if (filled.length === 0) { setError('Add at least one item.'); return }
    const bad = filled.find(l => !l.entryId || !(parseFloat(l.quantity) > 0))
    if (bad) { setError(`Line ${lines.indexOf(bad) + 1}: select an item and enter a quantity greater than 0.`); return }

    // The same row can appear on several lines; together they can't exceed what's available
    const wanted = {}
    filled.forEach(l => { wanted[l.entryId] = (wanted[l.entryId] ?? 0) + parseFloat(l.quantity) })
    const short = Object.entries(wanted).find(([id, qty]) => qty > itemsById[id].quantity)
    if (short) {
      const item = itemsById[short[0]]
      setError(`Only ${fmt(item.quantity)} ${item.unit} of ${item.name} available.`); return
    }
    if (!entryDate) { setError('Select a date.'); return }
    if (destType === 'store' && !targetStoreId) { setError('Select the destination store.'); return }
    if (destType === 'project' && !projectId) { setError('Select a project, or choose "+ New project".'); return }
    if (destType === 'project' && projectId === NEW_PROJECT_VALUE && !newProjectName.trim()) { setError('Enter the project name.'); return }
    if (destType === 'external' && !recipientId) { setError('Select a recipient, or choose "+ New recipient".'); return }
    if (destType === 'external' && recipientId === NEW_RECIPIENT_VALUE && !newRecipientName.trim()) { setError('Enter the recipient\'s name.'); return }

    setLoading(true); setError(''); setSaved('')
    try {
      const body = {
        sourceStoreId: store.id,
        refNo: refNo.trim() || null,
        entryDate,
        items: filled.map(l => ({ entryId: l.entryId, quantity: parseFloat(l.quantity) })),
      }

      if (destType === 'store') {
        body.targetStoreId = targetStoreId
      } else if (destType === 'project') {
        body.projectId = projectId
        if (projectId === NEW_PROJECT_VALUE) {
          const project = await createRecord('/api/projects', { name: newProjectName.trim(), location: newProjectLocation.trim() }, 'Unable to create project')
          setProjects(list => [...list, project].sort((a, b) => a.name.localeCompare(b.name)))
          setProjectId(project.id)
          setNewProjectName(''); setNewProjectLocation('')
          body.projectId = project.id
        }
      } else {
        body.recipientId = recipientId
        if (recipientId === NEW_RECIPIENT_VALUE) {
          const recipient = await createRecord('/api/recipients', { name: newRecipientName.trim(), company: newRecipientCompany.trim() }, 'Unable to create recipient')
          setRecipients(list => [...list, recipient].sort((a, b) => a.name.localeCompare(b.name)))
          setRecipientId(recipient.id)
          setNewRecipientName(''); setNewRecipientCompany('')
          body.recipientId = recipient.id
        }
      }

      const res = await apiFetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (!keepOpen) { onDone(); return }

      setSaved(`Saved ${data.count} item${data.count === 1 ? '' : 's'}${data.refNo ? ` under ${data.refNo}` : ''}. Enter the next ref no.`)
      setRefNo('')
      setLines([blankMoveLine()])
      setLoading(false)
      router.refresh()
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const note = destType === 'store'
    ? <>Stock moves from <strong>{store.name}</strong> to the destination store. The total inventory doesn&apos;t change.</>
    : destType === 'project'
      ? <>Stock leaves the inventory and is recorded as <strong>used</strong> on the project. It appears under Field records.</>
      : <>Stock leaves the inventory and is recorded as <strong>issued</strong> to the external party.</>

  return (
    <div className={styles.backdrop}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.fieldRow} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className={styles.field}>
              <label>Ref no.</label>
              <input
                autoFocus
                value={refNo}
                onChange={e => { setRefNo(e.target.value); setSaved('') }}
                placeholder="e.g. MIF-0042 (optional)"
              />
            </div>
            <div className={styles.field}>
              <label>Date</label>
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} max={todayStr} />
            </div>
            <div className={styles.field}>
              <label>From</label>
              <input value={store.name} disabled className={styles.disabledInput} />
            </div>
          </div>

          <div className={styles.fieldRow}>
            {destinations.length > 1 && (
              <div className={styles.field}>
                <label>Send to</label>
                <select value={destType} onChange={e => setDestType(e.target.value)}>
                  {destinations.map(d => (
                    <option key={d} value={d}>{DESTINATION_LABEL[d]}</option>
                  ))}
                </select>
              </div>
            )}

            {destType === 'store' && (
              <div className={styles.field}>
                <label>Destination store</label>
                <select value={targetStoreId} onChange={e => setTargetStoreId(e.target.value)}>
                  <option value="">— select store —</option>
                  {allStores.filter(s => s.id !== store.id).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.categoryName})</option>
                  ))}
                </select>
              </div>
            )}

            {destType === 'project' && (
              <div className={styles.field}>
                <label>Project</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">— select project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.location ? ` (${p.location})` : ''}</option>
                  ))}
                  <option value={NEW_PROJECT_VALUE}>+ New project…</option>
                </select>
                {projectId === NEW_PROJECT_VALUE && (
                  <div className={styles.fieldRow}>
                    <input autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project name" />
                    <input value={newProjectLocation} onChange={e => setNewProjectLocation(e.target.value)} placeholder="Site / location (optional)" />
                  </div>
                )}
              </div>
            )}

            {destType === 'external' && (
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
                  <div className={styles.fieldRow}>
                    <input autoFocus value={newRecipientName} onChange={e => setNewRecipientName(e.target.value)} placeholder="Recipient name" />
                    <input value={newRecipientCompany} onChange={e => setNewRecipientCompany(e.target.value)} placeholder="Company (optional)" />
                  </div>
                )}
              </div>
            )}
          </div>

          <span className={styles.fieldHint}>
            {refExists
              ? <>Ref no. <strong>{refNo.trim()}</strong> already has entries. These items will be added to it.</>
              : 'The ref no., date and destination apply to every item below.'}
          </span>

          <div className={styles.tableWrap} style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Rate (UGX)</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const item = itemsById[l.entryId]
                  return (
                    <tr key={l.key} className={styles.addRow}>
                      <td className={styles.mono}>{i + 1}</td>
                      <td style={{ minWidth: 260 }}>
                        <select
                          value={l.entryId}
                          onChange={e => setLine(l.key, 'entryId', e.target.value)}
                          className={styles.inlineSelect}
                        >
                          <option value="">{store.items.length ? '— select item —' : 'No stock in this store'}</option>
                          {store.items.map(it => (
                            <option key={it.id} value={it.id}>{itemLabel(it)}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number" min="0" max={item?.quantity} placeholder="Qty"
                          value={l.quantity} onChange={e => setLine(l.key, 'quantity', e.target.value)}
                          className={styles.inlineInputSmall}
                          disabled={!item}
                        />
                      </td>
                      <td className={styles.mono}>{item ? fmt(item.rate) : '—'}</td>
                      <td className={styles.mono}>{fmt((item?.rate ?? 0) * (parseFloat(l.quantity) || 0))}</td>
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
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <button type="button" className={styles.btnGhost} onClick={() => setLines(ls => [...ls, blankMoveLine()])}>
              <i className="ti ti-plus" /> Add item
            </button>
            <span className={styles.mono}>Total: UGX {fmt(total)}</span>
          </div>

          <div className={styles.transferNote}>
            <i className="ti ti-info-circle" />
            <span>{note}</span>
          </div>

          {saved && <p className={styles.fieldHint} style={{ color: 'var(--success)' }}>{saved}</p>}
          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnGhost} onClick={onClose}>{saved ? 'Close' : 'Cancel'}</button>
          {allowNext && (
            <button className={styles.btnGhost} onClick={() => submit(true)} disabled={loading}>
              Save &amp; next ref no.
            </button>
          )}
          <button className={styles.btnPrimary} onClick={() => submit(false)} disabled={loading}>
            {loading ? 'Saving…' : filled.length > 0 ? `Save ${filled.length} item${filled.length === 1 ? '' : 's'}` : 'Save'}
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
            <input value={`${item.name} (${item.unit})${item.owner !== '—' ? ` · owner: ${item.owner}` : ''}`} disabled className={styles.disabledInput} />
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
          <button className={styles.btnGhost} onClick={() => setModal('transfer')} title="Move stock to another store">
            <i className="ti ti-transfer" /> Transfer
          </button>
          <button className={styles.btnPrimary} onClick={() => setModal('out')} title="Issue stock for use: project (field) or external party">
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
          Movement log
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
                      <th>Owner</th>
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
                        <td className={item.owner === '—' ? styles.fieldHint : undefined}>{item.owner}</td>
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
                <p>No stock movements yet involving this store.</p>
              </div>
            ) : (
              transfers.map(t => {
                const isOut = t.sourceStoreId === store.id
                const destinationLabel = t.targetStore
                  ? t.targetStore.name
                  : t.project
                    ? t.project.name
                    : t.recipient
                      ? `${t.recipient.name}${t.recipient.company ? ` (${t.recipient.company})` : ''}`
                      : 'Unknown'
                const destinationCat = t.targetStore ? t.targetStore.category.name : t.project ? 'Field (used)' : 'External'
                const owner = t.owner && t.owner.id !== NO_OWNER ? ` · ${t.owner.name}` : ''
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
                    <div className={styles.transferItem}>
                      {t.product.name} · {t.product.unit.name}{owner}
                      {t.refNo && <div className={styles.fieldHint}>Ref {t.refNo}</div>}
                    </div>
                    <div className={styles.transferQty}>{fmt(t.quantity)} {t.product.unit.name}</div>
                    <div className={styles.transferTime}>{timeAgo(t.entryDate ?? t.createdAt)}</div>
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
                    <td className={styles.itemName}>
                      {entry.product.name}
                      {entry.ownerId !== NO_OWNER && <span className={styles.fieldHint}> · {entry.owner.name}</span>}
                    </td>
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
      {modal === 'transfer' && (
        <StockMoveModal
          title="Transfer to another store"
          destinations={TRANSFER_DESTINATIONS}
          store={store}
          allStores={allStores}
          onClose={() => setModal(null)}
          onDone={refresh}
        />
      )}
      {modal === 'out' && (
        <StockMoveModal
          title="Stock out"
          destinations={STOCK_OUT_DESTINATIONS}
          store={store}
          allStores={allStores}
          onClose={() => setModal(null)}
          onDone={refresh}
        />
      )}
      {modal?.edit && (
        <EditItemModal item={modal.edit} onClose={() => setModal(null)} onDone={refresh} />
      )}
    </>
  )
}