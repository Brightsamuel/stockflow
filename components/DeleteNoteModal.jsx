'use client'
import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { IconAlertCircle, IconAlertTriangle, IconInfoCircle, IconTrash } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { api } from '@/lib/api'
import { fmtDateTime, fmtNum, fmtSigned, plural } from '@/lib/format'
import ui from '@/styles/ui.module.css'

const REASON_MAX = 500
const PREVIEW_DELAY_MS = 300
const LINES_SHOWN = 4

function linesText(lines) {
  const shown = lines.slice(0, LINES_SHOWN).map(l => `${l.product} ${fmtNum(l.quantity)} ${l.unit}`)
  if (lines.length > LINES_SHOWN) shown.push(`and ${plural(lines.length - LINES_SHOWN, 'more item')}`)
  return shown.join(' · ')
}

// Confirms deleting a received, issue or transfer note with all its lines. A dry run on the
// server shows what it does to each store's stock and anything that stops it, and a reason is
// asked for the record. When the note's stock was issued or moved on since, the notes that did so
// are listed and each must be ticked to go with it: one deletion, restored together.
// note: a document from lib/notes; refNo or logId: which notes it is from.
export default function DeleteNoteModal({ note, refNo, logId, onClose, onDeleted }) {
  const [ticked, setTicked] = useState({})
  const [plan, setPlan] = useState(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const target = { refNo: refNo || null, logId: refNo ? null : logId || null, documentId: note.id }
  const withNotes = Object.values(ticked)
  const payload = JSON.stringify(withNotes)

  // Ask the server what deleting it (with the ticked notes) would do, shortly after the last tick
  useEffect(() => {
    const controller = new AbortController()
    const body = { refNo: refNo || null, logId: refNo ? null : logId || null, documentId: note.id, withNotes: JSON.parse(payload), preview: true }
    const timer = setTimeout(() => {
      api('/api/deletions', { method: 'POST', body, signal: controller.signal })
        .then(data => setPlan({ payload, ...data }))
        .catch(e => { if (e.name !== 'AbortError') setPlan({ payload, failed: e.message }) })
    }, payload === '[]' ? 0 : PREVIEW_DELAY_MS)
    return () => { clearTimeout(timer); controller.abort() }
  }, [payload, note.id, refNo, logId])

  // The last answer stays on screen while the next one loads
  const current = plan?.payload === payload ? plan : null
  const shown = plan && !plan.failed ? plan : null
  const dependents = shown?.dependents ?? []
  const blocked = !current || Boolean(current.failed || current.problems?.length || current.waiting?.length)

  function toggle(d) {
    setTicked(t => {
      const next = { ...t }
      if (next[d.documentId]) delete next[d.documentId]
      else next[d.documentId] = { refNo: d.refNo, logId: d.logId, documentId: d.documentId }
      return next
    })
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    if (!reason.trim()) { setError('Enter the reason for deleting this note.'); return }
    setSaving(true); setError('')
    try {
      await api('/api/deletions', { method: 'POST', body: { ...target, withNotes, reason: reason.trim() } })
      onDeleted(note, withNotes.length)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Delete ${note.title}`}
      subtitle={note.refNo ? `Ref no. ${note.refNo} · ${note.summary}` : note.summary}
      size="lg"
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="delete-note-form" className={`${ui.btn} ${ui.btnDanger}`} disabled={saving || blocked}>
            {saving
              ? <><span className={ui.spinner} /> Deleting…</>
              : <><IconTrash size={16} /> {withNotes.length ? `Delete note and ${plural(withNotes.length, 'other note')}` : 'Delete note'}</>}
          </button>
        </>
      )}
    >
      <form id="delete-note-form" className={ui.stack} onSubmit={submit}>
        <dl className={ui.docMeta}>
          {note.meta.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>

        {dependents.length > 0 && (
          <div className={ui.stack}>
            <div className={ui.rowBetween}>
              <span className={ui.sectionLabel}>Notes that used its stock</span>
              <span className={ui.muted}>{withNotes.length} of {dependents.length} ticked{!current && <> · <span className={ui.spinner} /></>}</span>
            </div>
            <span className={ui.muted}>
              Its stock was issued or moved on by the notes below. Left in place they would be moving stock that was
              never there, so they go with it. Tick each one to confirm.
            </span>
            <div className={ui.tickList}>
              {dependents.map(d => {
                const on = Boolean(ticked[d.documentId])
                return (
                  <label key={d.documentId} className={`${ui.tickItem} ${on ? ui.tickItemOn : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(d)} disabled={saving} />
                    <span className={ui.stackTight}>
                      <span className={ui.cellStrong}>{d.title}{d.refNo ? ` ${d.refNo}` : ''} · {d.date}</span>
                      <span className={ui.cellSub}>{d.summary}</span>
                      <span className={ui.cellSub}>{linesText(d.lines)}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {current?.waiting?.length > 0 && (
          <div className={`${ui.alert} ${ui.alertWarning}`}>
            <IconAlertTriangle size={17} />
            <div className={ui.stackTight}>
              <strong>Tick the notes that go with it</strong>
              {current.waiting.map(w => <span key={w}>{w}</span>)}
            </div>
          </div>
        )}

        <div className={ui.stack}>
          <span className={ui.sectionLabel}>What happens to the stock</span>
          {!shown && !plan?.failed && <div className={ui.skeleton} style={{ height: 88 }} />}
          {shown && (
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
                    {shown.changes.map(c => (
                      <tr key={c.key}>
                        <td>{c.store}</td>
                        <td>
                          <Link href={`/search?product=${c.productId}`} className={ui.cellLink} title="Open this product's history">{c.product}</Link>
                          <span className={ui.cellSub}>{c.owner !== '—' ? `${c.owner} · ` : ''}{c.unit}</span>
                        </td>
                        <td className={ui.num}>{fmtNum(c.before)}</td>
                        <td className={`${ui.num} ${ui.strong}`}>{c.delta ? fmtSigned(c.delta) : '—'}</td>
                        <td className={`${ui.num} ${c.after < 0 ? ui.textDanger : ''}`}>{c.after < 0 ? fmtSigned(c.after) : fmtNum(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {shown?.issued?.length > 0 && (
          <div className={`${ui.alert} ${ui.alertNeutral}`}>
            <IconInfoCircle size={17} />
            <div className={ui.stackTight}>
              <strong>No longer recorded as issued</strong>
              {shown.issued.map(i => (
                <span key={i.to}><strong>{i.to}:</strong> {i.items.map(it => `${it.product} ${fmtNum(it.quantity)} ${it.unit}`).join(' · ')}</span>
              ))}
            </div>
          </div>
        )}

        {current?.corrections?.length > 0 && !blocked && (
          <div className={`${ui.alert} ${ui.alertWarning}`}>
            <IconAlertTriangle size={17} />
            <div className={ui.stackTight}>
              <strong>These store corrections are undone too</strong>
              <span>
                They were made in the store after this note was saved, and everything else done to these items since goes
                with it, so the items go back to how they were before the note:
              </span>
              {current.corrections.map(c => (
                <span key={c.id}>{fmtDateTime(c.at)} · {c.store} · {c.product}: {c.what}</span>
              ))}
            </div>
          </div>
        )}

        {(current?.failed || current?.problems?.length > 0) && (
          <div className={`${ui.alert} ${ui.alertDanger}`}>
            <IconAlertTriangle size={17} />
            <div className={ui.stackTight}>
              <strong>This note can&apos;t be deleted yet</strong>
              {current.failed ? <span>{current.failed}</span> : current.problems.map(p => <span key={p}>{p}</span>)}
              {current.hint && <span className={ui.alertNote}>{current.hint}</span>}
            </div>
          </div>
        )}

        {current && !blocked && (
          <Field label="Reason" required hint="Kept with the deleted notes, e.g. entered twice, wrong store, wrong quantities">
            <input
              className={ui.input}
              value={reason}
              maxLength={REASON_MAX}
              autoFocus
              onChange={e => { setReason(e.target.value); setError('') }}
              placeholder="Why is this note being deleted?"
            />
          </Field>
        )}

        <div className={`${ui.alert} ${ui.alertInfo}`}>
          <IconInfoCircle size={17} />
          <span>
            Nothing is erased. The note{withNotes.length ? ` and the ${plural(withNotes.length, 'note')} ticked with it` : ' and its lines'} move
            to <strong>Deleted</strong> with your name, the date and the reason; reports, product history and the
            store&apos;s movement log stop counting them. A Super admin can restore {withNotes.length ? 'them from there, all together' : 'it from there'}.
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
