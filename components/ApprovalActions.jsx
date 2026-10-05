'use client'
import { useState } from 'react'
import { IconAlertCircle, IconMessageQuestion, IconRosetteDiscountCheck } from '@tabler/icons-react'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { fmtDate } from '@/lib/format'
import ui from '@/styles/ui.module.css'

function noteName(note) {
  return note.refNo ? `${note.title} ${note.refNo}` : note.title
}

// Where an issue note stands: Approved / Queried / Awaiting approval
export function ApprovalBadge({ approval }) {
  if (!approval?.needed) return null
  if (approval.status === 'APPROVED') {
    return <Badge tone="teal" dot title={`${approval.by ?? ''} · ${fmtDate(approval.at)}`}>Approved by {approval.by || 'an approver'}</Badge>
  }
  if (approval.status === 'QUERIED') return <Badge tone="danger" dot title={approval.comment ?? ''}>Queried{approval.by ? ` by ${approval.by}` : ''}</Badge>
  return <Badge tone="warning" dot>Awaiting approval</Badge>
}

// Approve / Query buttons for an issue note, shown to approvers while it isn't approved.
// scope: { refNo } or { logId }, which notes the note was found in (see lib/notes).
export default function ApprovalActions({ note, scope, currentUser, onDone }) {
  const { confirm, toast } = useConfirm()
  const [querying, setQuerying] = useState(false)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!currentUser?.canApprove || !note.approval?.needed || note.approval.status === 'APPROVED') return null
  const ownNote = note.recordedByIds?.includes(currentUser.id)

  async function send(action, text) {
    setBusy(true); setError('')
    try {
      await api('/api/approvals', {
        method: 'POST',
        body: { refNo: scope.refNo || null, logId: scope.refNo ? null : scope.logId, documentId: note.id, action, comment: text },
      })
      setQuerying(false)
      onDone(action === 'approve' ? `${noteName(note)} approved` : `${noteName(note)} queried`)
    } catch (e) {
      if (action === 'query') setError(e.message)
      else toast(e.message, { type: 'error', duration: 10000 })
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    const ok = await confirm({
      title: 'Approve stock out',
      message: `Approve ${noteName(note)} (${note.summary})?\n\nYour name goes on its "Approved by" line, with today's date.`,
      confirmLabel: 'Approve',
    })
    if (ok) send('approve')
  }

  return (
    <>
      <button
        type="button"
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnSm}`}
        onClick={approve}
        disabled={busy || ownNote}
        title={ownNote ? 'You recorded this stock out, so another approver must approve it' : 'Sign off this stock out'}
      >
        {busy ? <span className={ui.spinner} /> : <IconRosetteDiscountCheck size={15} />} Approve
      </button>
      <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => { setQuerying(true); setError('') }} disabled={busy}>
        <IconMessageQuestion size={15} /> Query
      </button>

      {querying && (
        <Modal
          title="Query stock out"
          subtitle={`${noteName(note)} · ${note.summary}`}
          onClose={() => setQuerying(false)}
          dismissible={!busy}
          footer={(
            <>
              <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setQuerying(false)} disabled={busy}>Cancel</button>
              <button type="submit" form="query-note" className={`${ui.btn} ${ui.btnPrimary}`} disabled={busy || !comment.trim()}>
                {busy ? <><span className={ui.spinner} /> Saving…</> : 'Send query'}
              </button>
            </>
          )}
        >
          <form id="query-note" className={ui.form} onSubmit={e => { e.preventDefault(); send('query', comment.trim()) }}>
            <Field label="What needs checking?" required hint="Shown on the note and on the Approvals page until it is approved.">
              <input autoFocus className={ui.input} value={comment} maxLength={500} onChange={e => setComment(e.target.value)} placeholder="e.g. Quantity of CT-8 looks too high" />
            </Field>
            {error && (
              <div className={`${ui.alert} ${ui.alertDanger}`}>
                <IconAlertCircle size={17} />
                <span>{error}</span>
              </div>
            )}
          </form>
        </Modal>
      )}
    </>
  )
}
