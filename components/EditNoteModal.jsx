'use client'
import { Fragment, useEffect, useState } from 'react'
import { IconAlertCircle, IconAlertTriangle, IconArrowBackUp, IconInfoCircle, IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { api } from '@/lib/api'
import { fmtMoney, fmtNum, fmtSigned } from '@/lib/format'
import { useList, nextLineKey } from '@/dashboard/hooks'
import ui from '@/styles/ui.module.css'

const REASON_MAX = 500
const PREVIEW_DELAY_MS = 400

function blankAdded() {
  return { key: nextLineKey(), productId: '', ownerId: '', quantity: '', rate: '' }
}

// Corrects a Goods Received Note (Admins and Super admins): change a line's qty or rate, take a
// line off, or add one. A dry run on the server shows what it does to each store's stock and
// anything that stops it; a reason is kept with the edit. note: a document from lib/notes.
export default function EditNoteModal({ note, refNo, logId, onClose, onEdited }) {
  const [lines, setLines] = useState(() => note.lines.map(l => ({ ...l, quantity: String(l.quantity), rate: String(l.rate), removed: false })))
  const [added, setAdded] = useState([])
  const [reason, setReason] = useState('')
  const [plan, setPlan] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [products, , productsLoaded] = useList('/api/products')

  // Stock added to a note with several owners must say whose it is
  const owners = [...new Map(note.lines.map(l => [l.ownerId, l.owner])).entries()]
  const needsOwner = owners.length > 1
  const target = { refNo: refNo || null, logId: refNo ? null : logId || null, documentId: note.id }

  const changes = {
    changed: lines
      .filter(l => !l.removed)
      .map(l => ({ logId: l.logId, quantity: parseFloat(l.quantity), rate: parseFloat(l.rate) }))
      .filter(l => {
        const original = note.lines.find(o => o.logId === l.logId)
        return original && (l.quantity !== original.quantity || l.rate !== original.rate)
      }),
    removed: lines.filter(l => l.removed).map(l => l.logId),
    added: added
      .filter(a => a.productId || a.quantity !== '')
      .map(a => ({ productId: a.productId, ownerId: a.ownerId || null, quantity: parseFloat(a.quantity), rate: parseFloat(a.rate) || 0 })),
  }
  const changeCount = changes.changed.length + changes.removed.length + changes.added.length
  const problem = (() => {
    const bad = lines.find(l => !l.removed && (!(parseFloat(l.quantity) > 0) || !(parseFloat(l.rate) >= 0)))
    if (bad) return `${bad.product}: enter a quantity above 0 and a rate of 0 or more, or take the line off.`
    const badNew = changes.added.find(a => !a.productId || !(a.quantity > 0))
    if (badNew) return 'New lines need a product and a quantity above 0.'
    if (needsOwner && changes.added.some(a => !a.ownerId)) return 'Choose whose stock each new line is.'
    return null
  })()
  const payload = JSON.stringify(changes)

  // Ask the server what the edit would do, shortly after the last change
  useEffect(() => {
    if (!changeCount || problem) return
    const controller = new AbortController()
    const body = { refNo: refNo || null, logId: refNo ? null : logId || null, documentId: note.id, ...JSON.parse(payload), preview: true }
    const timer = setTimeout(() => {
      api('/api/notes/edit', { method: 'POST', body, signal: controller.signal })
        .then(data => setPlan({ payload, ...data }))
        .catch(e => { if (e.name !== 'AbortError') setPlan({ payload, failed: e.message }) })
    }, PREVIEW_DELAY_MS)
    return () => { clearTimeout(timer); controller.abort() }
  }, [payload, changeCount, problem, note.id, refNo, logId])

  const current = plan?.payload === payload ? plan : null
  const blocked = Boolean(problem || current?.failed || current?.problems?.length)
  const ready = changeCount > 0 && current && !blocked

  function setLine(logId, field, value) {
    setLines(ls => ls.map(l => (l.logId === logId ? { ...l, [field]: value } : l)))
    setError('')
  }

  function setAddedLine(key, field, value) {
    setAdded(as => as.map(a => (a.key === key ? { ...a, [field]: value } : a)))
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    if (!changeCount) { setError('Change a quantity or rate, take a line off or add one.'); return }
    if (problem) { setError(problem); return }
    if (!reason.trim()) { setError('Enter the reason for editing this note.'); return }
    setSaving(true); setError('')
    try {
      await api('/api/notes/edit', { method: 'POST', body: { ...target, ...changes, reason: reason.trim() } })
      onEdited()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const total = lines.filter(l => !l.removed).reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0), 0) +
    changes.added.reduce((s, a) => s + (a.quantity || 0) * a.rate, 0)

  return (
    <Modal
      title={`Edit ${note.title}`}
      subtitle={note.refNo ? `Ref no. ${note.refNo} · ${note.summary}` : note.summary}
      size="xl"
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <span className={ui.modalFooterStart}>Total <strong>{fmtMoney(total)}</strong></span>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="edit-note-form" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving || !ready}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : 'Save changes'}
          </button>
        </>
      )}
    >
      <form id="edit-note-form" className={ui.stack} onSubmit={submit}>
        <dl className={ui.docMeta}>
          {note.meta.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>

        <div className={ui.stack}>
          <span className={ui.sectionLabel}>Lines</span>
          <div className={`${ui.card} ${ui.cardFlush}`}>
            <div className={ui.tableWrap}>
              <table className={`${ui.table} ${ui.tableCompact}`}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item</th>
                    <th className={ui.num}>Qty</th>
                    <th className={ui.num}>Rate (UGX)</th>
                    <th className={ui.num}>Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.logId} style={l.removed ? { opacity: 0.55 } : undefined}>
                      <td className={ui.cellMuted}>{i + 1}</td>
                      <td style={{ minWidth: 220 }}>
                        <span className={ui.cellStrong} style={l.removed ? { textDecoration: 'line-through' } : undefined}>{l.product}</span>
                        <span className={ui.cellSub}>{l.owner !== '—' ? `${l.owner} · ` : ''}{l.unit}{l.removed ? ' · taken off' : ''}</span>
                      </td>
                      <td style={{ minWidth: 100 }}>
                        <input
                          type="number" min="0" inputMode="decimal" className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                          value={l.quantity} onChange={e => setLine(l.logId, 'quantity', e.target.value)}
                          disabled={l.removed} aria-label={`Line ${i + 1} quantity`}
                        />
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <input
                          type="number" min="0" inputMode="decimal" className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                          value={l.rate} onChange={e => setLine(l.logId, 'rate', e.target.value)}
                          disabled={l.removed} aria-label={`Line ${i + 1} rate`}
                        />
                      </td>
                      <td className={ui.num}>{l.removed ? '—' : fmtNum((parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0))}</td>
                      <td>
                        {l.removed ? (
                          <button type="button" className={ui.iconBtn} title="Keep this line" onClick={() => setLine(l.logId, 'removed', false)}>
                            <IconArrowBackUp size={16} />
                          </button>
                        ) : (
                          <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Take this line off the note" onClick={() => setLine(l.logId, 'removed', true)}>
                            <IconTrash size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {added.map((a, i) => (
                    <tr key={a.key}>
                      <td className={ui.cellMuted}>{lines.length + i + 1}</td>
                      <td style={{ minWidth: 220 }}>
                        <div className={ui.stackTight}>
                          <select
                            className={`${ui.input} ${ui.inputSm}`} value={a.productId} disabled={!productsLoaded}
                            onChange={e => setAddedLine(a.key, 'productId', e.target.value)} aria-label={`New line ${i + 1} product`}
                          >
                            <option value="">{productsLoaded ? 'Choose a product…' : 'Loading…'}</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit.name})</option>)}
                          </select>
                          {needsOwner && (
                            <select className={`${ui.input} ${ui.inputSm}`} value={a.ownerId} onChange={e => setAddedLine(a.key, 'ownerId', e.target.value)} aria-label={`New line ${i + 1} owner`}>
                              <option value="">Whose stock?</option>
                              {owners.map(([id, label]) => <option key={id} value={id}>{label === '—' ? 'No owner' : label}</option>)}
                            </select>
                          )}
                        </div>
                      </td>
                      <td style={{ minWidth: 100 }}>
                        <input
                          type="number" min="0" inputMode="decimal" placeholder="0" className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                          value={a.quantity} onChange={e => setAddedLine(a.key, 'quantity', e.target.value)} aria-label={`New line ${i + 1} quantity`}
                        />
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <input
                          type="number" min="0" inputMode="decimal" placeholder="0" className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                          value={a.rate} onChange={e => setAddedLine(a.key, 'rate', e.target.value)} aria-label={`New line ${i + 1} rate`}
                        />
                      </td>
                      <td className={ui.num}>{fmtNum((parseFloat(a.quantity) || 0) * (parseFloat(a.rate) || 0))}</td>
                      <td>
                        <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Remove this new line" onClick={() => setAdded(as => as.filter(x => x.key !== a.key))}>
                          <IconX size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => setAdded(as => [...as, blankAdded()])}>
              <IconPlus size={15} /> Add item
            </button>
          </div>
        </div>

        {changeCount > 0 && !problem && (
          <div className={ui.stack}>
            <span className={ui.sectionLabel}>What happens to the stock</span>
            {!current && <div className={ui.skeleton} style={{ height: 72 }} />}
            {current?.changes && (
              <div className={`${ui.card} ${ui.cardFlush}`}>
                <div className={ui.tableWrap}>
                  <table className={`${ui.table} ${ui.tableCompact}`}>
                    <thead>
                      <tr>
                        <th>Store</th>
                        <th>Item</th>
                        <th className={ui.num}>Now</th>
                        <th className={ui.num}>Change</th>
                        <th className={ui.num}>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.changes.map(c => (
                        <tr key={c.key}>
                          <td>{c.store}</td>
                          <td>{c.product}<span className={ui.cellSub}>{c.owner !== '—' ? `${c.owner} · ` : ''}{c.unit}</span></td>
                          <td className={ui.num}>{fmtNum(c.before)}</td>
                          <td className={`${ui.num} ${ui.strong}`}>{fmtSigned(c.delta)}</td>
                          <td className={`${ui.num} ${c.after < 0 ? ui.textDanger : ''}`}>{c.after < 0 ? fmtSigned(c.after) : fmtNum(c.after)}</td>
                        </tr>
                      ))}
                      {current.changes.length === 0 && (
                        <tr><td colSpan={5} className={ui.cellMuted}>No change to the stock (a rate change only).</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {(current?.failed || current?.problems?.length > 0) && (
          <div className={`${ui.alert} ${ui.alertDanger}`}>
            <IconAlertTriangle size={17} />
            <div className={ui.stackTight}>
              <strong>This edit can&apos;t be saved</strong>
              {current.failed ? <span>{current.failed}</span> : current.problems.map(p => <span key={p}>{p}</span>)}
              {current.hint && <span className={ui.alertNote}>{current.hint}</span>}
            </div>
          </div>
        )}

        {changeCount > 0 && (
          <Field label="Reason" required hint="Kept with the edit and shown on the note, e.g. 79 delivered, not 90">
            <input
              className={ui.input}
              value={reason}
              maxLength={REASON_MAX}
              onChange={e => { setReason(e.target.value); setError('') }}
              placeholder="Why is this note being changed?"
            />
          </Field>
        )}

        <div className={`${ui.alert} ${ui.alertInfo}`}>
          <IconInfoCircle size={17} />
          <span>
            The store&apos;s stock moves by the difference. The note shows what changed, by whom and why; the lines as they
            were are kept for the record but no longer count in stock, reports or product history.
          </span>
        </div>

        {error && (
          <div className={`${ui.alert} ${ui.alertDanger}`}>
            <IconAlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}
