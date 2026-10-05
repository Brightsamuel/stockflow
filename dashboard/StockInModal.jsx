'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertCircle, IconCircleCheck, IconInfoCircle, IconPlus, IconX } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { fmtMoney, fmtNum, plural, todayInput } from '@/lib/format'
import { postMovement, useList, useRefExists, useScrollOnAdd, nextLineKey } from './hooks'
import ui from '@/styles/ui.module.css'

const NEW_OWNER = '__new_owner__'

function blankLine() {
  return { key: nextLineKey(), productId: '', rate: '', quantity: '', lowStockAt: '' }
}

function isFilled(line) {
  return line.productId || line.rate !== '' || line.quantity !== ''
}

function noteLink(refNo, label) {
  return refNo ? { label, href: `/notes?ref=${encodeURIComponent(refNo)}` } : undefined
}

// One ref no., date and owner for the whole receipt, followed by as many item lines as needed
export default function StockInModal({ store, onClose, onDone }) {
  const router = useRouter()
  const { confirm, toast } = useConfirm()
  const today = todayInput()
  const [products, , productsLoaded] = useList('/api/products')
  const [owners, setOwners] = useList('/api/owners')
  const [ownerId, setOwnerId] = useState('')
  const [newOwnerName, setNewOwnerName] = useState('')
  const [refNo, setRefNo] = useState('')
  const [entryDate, setEntryDate] = useState(today)
  const [forProjectId, setForProjectId] = useState('')
  const [projects] = useList('/api/projects')
  const [deliveredBy, setDeliveredBy] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [people] = useList('/api/people')
  const [lines, setLines] = useState(() => [blankLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const refExists = useRefExists(refNo)
  const bodyRef = useScrollOnAdd(lines.length)
  const filledCount = lines.filter(isFilled).length
  const total = lines.reduce((s, l) => s + (parseFloat(l.rate) || 0) * (parseFloat(l.quantity) || 0), 0)

  function setLine(key, field, value) {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, [field]: value } : l)))
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
      setError(`Line ${lines.indexOf(bad) + 1}: choose a product, and enter a quantity above 0 and a rate (0 or more).`)
      return
    }
    if (!entryDate) { setError('Choose a date.'); return }
    if (ownerId === NEW_OWNER && !newOwnerName.trim()) { setError("Enter the new owner's name."); return }

    setSaving(true); setError(''); setSaved('')
    try {
      let finalOwnerId = ownerId || null
      if (ownerId === NEW_OWNER) {
        const owner = await api('/api/owners', { method: 'POST', body: { name: newOwnerName.trim() } })
        setOwners(list => [...list, owner].sort((a, b) => a.name.localeCompare(b.name)))
        setOwnerId(owner.id)
        setNewOwnerName('')
        finalOwnerId = owner.id
      }

      const data = await postMovement(`/api/stores/${store.id}/stock-in`, {
        refNo: refNo.trim() || null,
        entryDate,
        ownerId: finalOwnerId,
        forProjectId: forProjectId || null,
        deliveredBy: deliveredBy.trim() || null,
        receivedBy: receivedBy.trim() || null,
        items: filled.map(l => ({
          productId: l.productId,
          rate: parseFloat(l.rate),
          quantity: parseFloat(l.quantity),
          // Left blank keeps the item's existing low-stock alert
          lowStockAt: l.lowStockAt === '' ? null : parseFloat(l.lowStockAt),
        })),
      }, confirm)
      if (!data) return

      const summary = `${plural(data.count, 'item')} received into ${store.name}${data.refNo ? ` under ${data.refNo}` : ''}.`
      toast(summary, { action: noteLink(data.refNo, 'Print received note') })
      if (!keepOpen) { onDone(); return }

      setSaved(`${summary} Enter the next ref no.`)
      setRefNo('')
      setLines([blankLine()])
      router.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Stock in"
      subtitle={`Receive items into ${store.name}`}
      size="xl"
      onClose={onClose}
      dismissible={!saving}
      bodyRef={bodyRef}
      footer={(
        <>
          <span className={ui.modalFooterStart}>
            {filledCount > 0 ? <>{plural(filledCount, 'item')} · <strong>{fmtMoney(total)}</strong></> : 'No items yet'}
          </span>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>
            {saved ? 'Close' : 'Cancel'}
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => submit(true)} disabled={saving}>
            Save &amp; next ref no.
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => submit(false)} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : filledCount > 0 ? `Save ${plural(filledCount, 'item')}` : 'Save'}
          </button>
        </>
      )}
    >
      <div className={ui.formRow3}>
        <Field label="Ref no." hint="Optional, e.g. the delivery or receipt number">
          <input autoFocus className={ui.input} value={refNo} onChange={e => { setRefNo(e.target.value); setSaved('') }} placeholder="e.g. RCT-1234" />
        </Field>
        <Field label="Date" required>
          <input type="date" className={ui.input} value={entryDate} max={today} onChange={e => setEntryDate(e.target.value)} />
        </Field>
        <Field label="Stock owner" hint="Who this stock belongs to (optional)" asLabel={false}>
          <select className={ui.input} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            <option value="">No owner</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value={NEW_OWNER}>+ New owner…</option>
          </select>
          {ownerId === NEW_OWNER && (
            <input autoFocus className={ui.input} value={newOwnerName} onChange={e => setNewOwnerName(e.target.value)} placeholder="Owner name" />
          )}
        </Field>
      </div>

      <Field
        label="For project"
        hint={forProjectId
          ? 'Kept for this project: it gets its own line in the store and can only be issued to it (an admin can release leftovers to general stock).'
          : 'Optional. Choose a project when the stock was supplied for it, e.g. by the contractor.'}
      >
        <select className={ui.input} value={forProjectId} onChange={e => setForProjectId(e.target.value)}>
          <option value="">General stock (not for a project)</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.location ? ` (${p.location})` : ''}</option>)}
        </select>
      </Field>

      <div className={ui.formRow2}>
        <Field label="Delivered by" hint="Optional. Printed on the Goods Received Note; leave empty to write it by hand.">
          <input className={ui.input} list="stock-in-people" value={deliveredBy} onChange={e => setDeliveredBy(e.target.value)} placeholder="Supplier's driver, contractor…" autoComplete="off" />
        </Field>
        <Field label="Received by" hint="Optional. The person who physically received the goods.">
          <input className={ui.input} list="stock-in-people" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Storekeeper's name" autoComplete="off" />
        </Field>
        <datalist id="stock-in-people">
          {people.map(name => <option key={name} value={name} />)}
        </datalist>
      </div>

      {refExists ? (
        <div className={`${ui.alert} ${ui.alertInfo}`}>
          <IconInfoCircle size={17} />
          <span>Ref no. <strong>{refNo.trim()}</strong> already has entries. These items will be added to it.</span>
        </div>
      ) : (
        <p className={ui.hint}>The ref no., date, owner, project and names apply to every item below.</p>
      )}

      <div className={ui.stack}>
        <span className={ui.sectionLabel}>Items</span>
        <div className={`${ui.card} ${ui.cardFlush}`}>
          <div className={ui.tableWrap}>
            <table className={`${ui.table} ${ui.tableCompact}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className={ui.num}>Qty</th>
                  <th className={ui.num}>Rate (UGX)</th>
                  <th className={ui.num}>Low stock at</th>
                  <th className={ui.num}>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key}>
                    <td className={ui.cellMuted}>{i + 1}</td>
                    <td style={{ minWidth: 220 }}>
                      <select
                        className={`${ui.input} ${ui.inputSm}`}
                        value={l.productId}
                        onChange={e => setLine(l.key, 'productId', e.target.value)}
                        disabled={!productsLoaded}
                        aria-label={`Line ${i + 1} product`}
                      >
                        <option value="">{productsLoaded ? 'Choose a product…' : 'Loading…'}</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit.name})</option>)}
                      </select>
                    </td>
                    <td style={{ minWidth: 90 }}>
                      <input type="number" min="0" inputMode="decimal" placeholder="0" className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                        value={l.quantity} onChange={e => setLine(l.key, 'quantity', e.target.value)} aria-label={`Line ${i + 1} quantity`} />
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <input type="number" min="0" inputMode="decimal" placeholder="0" className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                        value={l.rate} onChange={e => setLine(l.key, 'rate', e.target.value)} aria-label={`Line ${i + 1} rate`} />
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <input type="number" min="0" inputMode="decimal" placeholder="Keep" className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                        value={l.lowStockAt} onChange={e => setLine(l.key, 'lowStockAt', e.target.value)} aria-label={`Line ${i + 1} low stock alert`} />
                    </td>
                    <td className={ui.num}>{fmtNum((parseFloat(l.rate) || 0) * (parseFloat(l.quantity) || 0))}</td>
                    <td>
                      <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Remove line" onClick={() => removeLine(l.key)} disabled={lines.length === 1}>
                        <IconX size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={ui.rowBetween}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => setLines(ls => [...ls, blankLine()])}>
            <IconPlus size={15} /> Add item
          </button>
          <span className={ui.strong}>Total {fmtMoney(total)}</span>
        </div>
      </div>

      {productsLoaded && products.length === 0 && (
        <div className={`${ui.alert} ${ui.alertWarning}`}>
          <IconInfoCircle size={17} />
          <span>There are no products yet. Create them under Products first.</span>
        </div>
      )}
      {saved && (
        <div className={`${ui.alert} ${ui.alertSuccess}`}>
          <IconCircleCheck size={17} />
          <span>{saved}</span>
        </div>
      )}
      {error && (
        <div className={`${ui.alert} ${ui.alertDanger}`}>
          <IconAlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}
