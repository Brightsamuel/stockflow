'use client'
import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { IconAlertCircle, IconAlertTriangle, IconInfoCircle, IconTrash } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { api } from '@/lib/api'
import { fmtNum, fmtSigned } from '@/lib/format'
import ui from '@/styles/ui.module.css'

const REASON_MAX = 500

// Confirms deleting a received, issue or transfer note with all its lines. A dry run on the
// server shows what it does to each store's stock and anything that stops it, and a reason is
// asked for the record. note: a document from lib/notes; refNo or logId: which notes it is from.
export default function DeleteNoteModal({ note, refNo, logId, onClose, onDeleted }) {
  const [plan, setPlan] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const target = { refNo: refNo || null, logId: refNo ? null : logId || null, documentId: note.id }

  useEffect(() => {
    let active = true
    api('/api/deletions', { method: 'POST', body: { refNo: refNo || null, logId: refNo ? null : logId || null, documentId: note.id, preview: true } })
      .then(data => { if (active) setPlan(data) })
      .catch(e => { if (active) setLoadError(e.message) })
    return () => { active = false }
  }, [note.id, refNo, logId])

  const blocked = Boolean(loadError || plan?.problems.length)

  async function submit(e) {
    e.preventDefault()
    if (!reason.trim()) { setError('Enter the reason for deleting this note.'); return }
    setSaving(true); setError('')
    try {
      await api('/api/deletions', { method: 'POST', body: { ...target, reason: reason.trim() } })
      onDeleted(note)
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
          <button type="submit" form="delete-note-form" className={`${ui.btn} ${ui.btnDanger}`} disabled={saving || !plan || blocked}>
            {saving ? <><span className={ui.spinner} /> Deleting…</> : <><IconTrash size={16} /> Delete note</>}
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

        <div className={ui.stack}>
          <span className={ui.sectionLabel}>What happens to the stock</span>
          {!plan && !loadError && <div className={ui.skeleton} style={{ height: 88 }} />}
          {plan && (
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
                    {plan.changes.map(c => (
                      <tr key={c.key}>
                        <td>{c.store}</td>
                        <td>
                          <Link href={`/search?product=${c.productId}`} className={ui.cellLink} title="Open this product's history">{c.product}</Link>
                          <span className={ui.cellSub}>{c.owner !== '—' ? `${c.owner} · ` : ''}{c.unit}</span>
                        </td>
                        <td className={ui.num}>{fmtNum(c.before)}</td>
                        <td className={`${ui.num} ${ui.strong}`}>{fmtSigned(c.delta)}</td>
                        <td className={`${ui.num} ${c.after < 0 ? ui.textDanger : ''}`}>{c.after < 0 ? fmtSigned(c.after) : fmtNum(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {(loadError || plan?.problems.length > 0) && (
          <div className={`${ui.alert} ${ui.alertDanger}`}>
            <IconAlertTriangle size={17} />
            <div className={ui.stackTight}>
              <strong>This note can&apos;t be deleted yet</strong>
              {loadError ? <span>{loadError}</span> : plan.problems.map(p => <span key={p}>{p}</span>)}
              {plan?.hint && <span className={ui.alertNote}>{plan.hint}</span>}
            </div>
          </div>
        )}

        {!blocked && (
          <Field label="Reason" required hint="Kept with the deleted note, e.g. entered twice, wrong store, wrong quantities">
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
            Nothing is erased. The note and its lines move to <strong>Deleted</strong> with your name, the date and the
            reason; reports, product history and the store&apos;s movement log stop counting them. A Super admin can
            restore it from there.
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
