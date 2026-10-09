'use client'
import { useEffect, useState } from 'react'
import { IconAlertCircle, IconAlertTriangle, IconInfoCircle, IconTrash } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { api } from '@/lib/api'
import { fmtDate, fmtDateTime, fmtNum, plural } from '@/lib/format'
import ui from '@/styles/ui.module.css'

const REASON_MAX = 500

// Deletes a removed item for good (Super admin). A dry run on the server says whether its whole
// history goes with it (only received stock and store corrections on its row) or stays, and why.
// entry: a row from the store's Removed items.
export default function DeleteForGoodModal({ entry, storeName, onClose, onDone }) {
  const [plan, setPlan] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api(`/api/items/${entry.id}/permanent`)
      .then(data => { if (active) setPlan(data) })
      .catch(e => { if (active) setLoadError(e.message) })
    return () => { active = false }
  }, [entry.id])

  async function submit(e) {
    e.preventDefault()
    if (plan?.erasable && !reason.trim()) { setError('Enter the reason for deleting this item for good.'); return }
    setSaving(true); setError('')
    try {
      const result = await api(`/api/items/${entry.id}/permanent`, { method: 'DELETE', body: { reason: reason.trim() } })
      onDone(result.erased
        ? `${entry.name} deleted for good, with its history`
        : `${entry.name} deleted for good. Its history is kept.`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Delete for good"
      subtitle={`${entry.name}${entry.owner !== '—' ? ` (${entry.owner})` : ''} · ${storeName}`}
      size="lg"
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="delete-for-good" className={`${ui.btn} ${ui.btnDanger}`} disabled={saving || !plan || Boolean(loadError)}>
            {saving ? <><span className={ui.spinner} /> Deleting…</> : <><IconTrash size={16} /> Delete for good</>}
          </button>
        </>
      )}
    >
      <form id="delete-for-good" className={ui.stack} onSubmit={submit}>
        {!plan && !loadError && <div className={ui.skeleton} style={{ height: 120 }} />}
        {loadError && (
          <div className={`${ui.alert} ${ui.alertDanger}`}>
            <IconAlertCircle size={17} />
            <span>{loadError}</span>
          </div>
        )}

        {plan?.erasable && (
          <>
            <p>
              Everything recorded for this item in {storeName} goes with it. It no longer appears in the product&apos;s
              history, in reports or on the notes below.
            </p>
            <div className={ui.stackTight}>
              {plan.receipts.map(r => (
                <span key={r.id}>
                  <strong className={ui.strong}>Received {fmtNum(r.quantity)} {plan.unit}</strong> on {fmtDate(r.date)},{' '}
                  {r.refNo ? <>Goods Received Note <span className={ui.mono}>{r.refNo}</span></> : 'a Goods Received Note with no ref no.'}
                  {r.otherLines ? ` (taken off the note; its ${plural(r.otherLines, 'other line')} stay)` : ' (its only line, so the note goes)'}
                </span>
              ))}
              {plan.corrections.map(c => (
                <span key={c.id} className={ui.cellMuted}>{fmtDateTime(c.at)}: {c.what}</span>
              ))}
            </div>
            <Field label="Reason" required hint="Kept with the record, e.g. entered in error, wrong product">
              <input
                className={ui.input}
                value={reason}
                maxLength={REASON_MAX}
                autoFocus
                onChange={e => { setReason(e.target.value); setError('') }}
                placeholder="Why is this item being deleted for good?"
              />
            </Field>
            <div className={`${ui.alert} ${ui.alertInfo}`}>
              <IconInfoCircle size={17} />
              <span>
                Kept under Documents → <strong>Deleted</strong> with your name, the date and the reason. A Super admin can
                restore it from there, which puts the item back in Removed items with its history.
              </span>
            </div>
          </>
        )}

        {plan && !plan.erasable && (
          <div className={`${ui.alert} ${ui.alertWarning}`}>
            <IconAlertTriangle size={17} />
            <div className={ui.stackTight}>
              <strong>The row goes, but its history stays</strong>
              <span>Some of this stock was moved or used, and those records depend on it:</span>
              {plan.kept.map(k => <span key={k}>{k}</span>)}
              <span className={ui.alertNote}>
                If the delivery note it came in on was wrong, delete that note in Documents instead: the notes that issued
                its stock are listed there to go with it, and the item leaves the history with them.
              </span>
            </div>
          </div>
        )}

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
