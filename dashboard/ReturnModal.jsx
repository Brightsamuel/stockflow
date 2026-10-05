'use client'
import { useEffect, useState } from 'react'
import { IconAlertCircle, IconInfoCircle, IconPlus, IconX } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { fmtNum, plural, todayInput } from '@/lib/format'
import { postMovement, useList, useScrollOnAdd, nextLineKey } from './hooks'
import ui from '@/styles/ui.module.css'

function blankLine() {
  return { key: nextLineKey(), item: '', quantity: '' }
}

// Stock coming back from a project's site into this store. Only what was issued to the project
// from this store, less earlier returns, can come back; it goes back onto the project's own line
// (kept for it) or into general stock.
export default function ReturnModal({ store, onClose, onDone }) {
  const { confirm, toast } = useConfirm()
  const today = todayInput()
  const [projects] = useList('/api/projects')
  const [people] = useList('/api/people')
  const [projectId, setProjectId] = useState('')
  const [available, setAvailable] = useState({ projectId: null, items: [] })
  const [putBack, setPutBack] = useState('')
  const [refNo, setRefNo] = useState('')
  const [entryDate, setEntryDate] = useState(today)
  const [returnedBy, setReturnedBy] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [lines, setLines] = useState(() => [blankLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const bodyRef = useScrollOnAdd(lines.length)

  useEffect(() => {
    if (!projectId) return undefined
    const controller = new AbortController()
    api(`/api/returns?storeId=${store.id}&projectId=${projectId}`, { signal: controller.signal })
      .then(data => setAvailable({ projectId, items: Array.isArray(data) ? data : [] }))
      .catch(e => { if (e.name !== 'AbortError') setAvailable({ projectId, items: [] }) })
    return () => controller.abort()
  }, [store.id, projectId])

  const loaded = available.projectId === projectId
  const choices = loaded ? available.items.filter(a => a.returnable > 0) : []
  const byKey = Object.fromEntries(choices.map(a => [a.key, a]))
  const project = projects.find(p => p.id === projectId)
  // Default: back onto the project's own line when this store keeps stock for it
  const keepsForProject = store.items.some(i => i.forProjectId === projectId)
  const where = putBack || (keepsForProject ? 'project' : 'general')
  const filled = lines.filter(l => l.item || l.quantity !== '')

  function setLine(key, field, value) {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, [field]: value } : l)))
  }

  function chooseProject(id) {
    setProjectId(id)
    setPutBack('')
    setLines([blankLine()])
  }

  async function submit() {
    if (!projectId) { setError('Choose the project the stock is coming back from.'); return }
    if (filled.length === 0) { setError('Add at least one item.'); return }
    const bad = filled.find(l => !byKey[l.item] || !(parseFloat(l.quantity) > 0))
    if (bad) { setError(`Line ${lines.indexOf(bad) + 1}: choose an item and enter a quantity above 0.`); return }
    const wanted = {}
    filled.forEach(l => { wanted[l.item] = (wanted[l.item] ?? 0) + parseFloat(l.quantity) })
    const over = Object.entries(wanted).find(([key, qty]) => qty - byKey[key].returnable > 1e-9)
    if (over) {
      const a = byKey[over[0]]
      setError(`Only ${fmtNum(a.returnable)} ${a.unit} of ${a.product} can come back (issued ${fmtNum(a.issued)}, returned ${fmtNum(a.returned)}).`)
      return
    }

    setSaving(true); setError('')
    try {
      const data = await postMovement('/api/returns', {
        storeId: store.id,
        projectId,
        putBack: where,
        refNo: refNo.trim() || null,
        entryDate,
        returnedBy: returnedBy.trim() || null,
        receivedBy: receivedBy.trim() || null,
        items: filled.map(l => ({ productId: byKey[l.item].productId, ownerId: byKey[l.item].ownerId, quantity: parseFloat(l.quantity) })),
      }, confirm)
      if (!data) return
      toast(`${plural(data.count, 'item')} returned from ${project?.name ?? 'the project'} into ${store.name}.`, {
        action: data.refNo ? { label: 'Print return note', href: `/notes?ref=${encodeURIComponent(data.refNo)}` } : undefined,
      })
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Return from project"
      subtitle={`Stock coming back into ${store.name}`}
      size="xl"
      onClose={onClose}
      dismissible={!saving}
      bodyRef={bodyRef}
      footer={(
        <>
          <span className={ui.modalFooterStart}>{filled.length > 0 ? plural(filled.length, 'item') : 'No items yet'}</span>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={submit} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : filled.length > 0 ? `Save ${plural(filled.length, 'item')}` : 'Save'}
          </button>
        </>
      )}
    >
      <div className={ui.formRow3}>
        <Field label="From project" required>
          <select className={ui.input} value={projectId} onChange={e => chooseProject(e.target.value)} autoFocus>
            <option value="">Choose a project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.location ? ` (${p.location})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Ref no." hint="Optional, e.g. the return form number">
          <input className={ui.input} value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="e.g. RTN-0012" autoComplete="off" />
        </Field>
        <Field label="Date" required>
          <input type="date" className={ui.input} value={entryDate} max={today} onChange={e => setEntryDate(e.target.value)} />
        </Field>
      </div>

      <div className={ui.formRow3}>
        <Field label="Put back as" hint={where === 'project' ? 'Kept for the project: it can only be issued to it again.' : 'General stock: it can be issued anywhere.'}>
          <select className={ui.input} value={where} onChange={e => setPutBack(e.target.value)} disabled={!projectId}>
            <option value="project">Kept for {project?.name ?? 'the project'}</option>
            <option value="general">General stock</option>
          </select>
        </Field>
        <Field label="Returned by" hint="Optional. Printed on the Material Return Note.">
          <input className={ui.input} list="return-people" value={returnedBy} onChange={e => setReturnedBy(e.target.value)} placeholder="Who brought it back" autoComplete="off" />
        </Field>
        <Field label="Received by" hint="Optional. Who received it at the store.">
          <input className={ui.input} list="return-people" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Storekeeper's name" autoComplete="off" />
        </Field>
        <datalist id="return-people">
          {people.map(name => <option key={name} value={name} />)}
        </datalist>
      </div>

      {projectId && loaded && choices.length === 0 && (
        <div className={`${ui.alert} ${ui.alertInfo}`}>
          <IconInfoCircle size={17} />
          <span>Nothing issued to {project?.name ?? 'this project'} from {store.name} is waiting to come back.</span>
        </div>
      )}

      <div className={ui.stack}>
        <span className={ui.sectionLabel}>Items</span>
        <div className={`${ui.card} ${ui.cardFlush}`}>
          <div className={ui.tableWrap}>
            <table className={`${ui.table} ${ui.tableCompact}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th className={ui.num}>Issued</th>
                  <th className={ui.num}>Returned so far</th>
                  <th className={ui.num}>Qty coming back</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const a = byKey[l.item]
                  return (
                    <tr key={l.key}>
                      <td className={ui.cellMuted}>{i + 1}</td>
                      <td style={{ minWidth: 280 }}>
                        <select className={`${ui.input} ${ui.inputSm}`} value={l.item} onChange={e => setLine(l.key, 'item', e.target.value)} disabled={!projectId || !loaded} aria-label={`Line ${i + 1} item`}>
                          <option value="">{!projectId ? 'Choose the project first' : !loaded ? 'Loading…' : 'Choose an item…'}</option>
                          {choices.map(c => (
                            <option key={c.key} value={c.key}>
                              {c.product}{c.owner !== '—' ? ` · ${c.owner}` : ''}: up to {fmtNum(c.returnable)} {c.unit}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={ui.num}>{a ? fmtNum(a.issued) : '—'}</td>
                      <td className={ui.num}>{a ? fmtNum(a.returned) : '—'}</td>
                      <td style={{ minWidth: 110 }}>
                        <input
                          type="number" min="0" max={a?.returnable} inputMode="decimal" placeholder="0"
                          className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                          value={l.quantity} onChange={e => setLine(l.key, 'quantity', e.target.value)}
                          disabled={!a} aria-label={`Line ${i + 1} quantity`}
                        />
                      </td>
                      <td>
                        <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Remove line" onClick={() => setLines(ls => (ls.length > 1 ? ls.filter(x => x.key !== l.key) : ls))} disabled={lines.length === 1}>
                          <IconX size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => setLines(ls => [...ls, blankLine()])} disabled={!choices.length}>
            <IconPlus size={15} /> Add item
          </button>
        </div>
      </div>

      {error && (
        <div className={`${ui.alert} ${ui.alertDanger}`}>
          <IconAlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}
