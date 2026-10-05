'use client'
import { useState } from 'react'
import { IconAlertCircle, IconLockOpen2 } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { fmtNum } from '@/lib/format'
import ui from '@/styles/ui.module.css'

// Moves stock kept for a project (e.g. what is left when it ends) into general stock (Admin)
export default function ReleaseModal({ item, onClose, onDone }) {
  const { toast } = useConfirm()
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    const qty = parseFloat(quantity)
    if (!(qty > 0)) { setError('Enter a quantity above 0.'); return }
    if (qty - item.quantity > 1e-9) { setError(`Only ${fmtNum(item.quantity)} ${item.unit} is kept for ${item.keptFor}.`); return }
    setSaving(true); setError('')
    try {
      await api(`/api/items/${item.id}/release`, { method: 'POST', body: { quantity: qty } })
      toast(`${fmtNum(qty)} ${item.unit} of ${item.name} moved to general stock`)
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Release to general stock"
      subtitle={`${item.name} kept for ${item.keptFor}`}
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="release-stock" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : <><IconLockOpen2 size={16} /> Release</>}
          </button>
        </>
      )}
    >
      <form id="release-stock" className={ui.form} onSubmit={submit}>
        <p className={ui.hint}>
          Stock kept for {item.keptFor} can only be issued to that project. Releasing it puts it on this store&apos;s general line,
          where it can be issued anywhere. The move is recorded in the history.
        </p>
        <Field label="Quantity" required hint={`${fmtNum(item.quantity)} ${item.unit} kept for ${item.keptFor}`}>
          <input autoFocus type="number" min="0" inputMode="decimal" className={`${ui.input} ${ui.inputNum}`} value={quantity} onChange={e => setQuantity(e.target.value)} />
        </Field>
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
