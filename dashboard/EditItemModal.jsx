'use client'
import { useState } from 'react'
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { fmtSigned } from '@/lib/format'
import ui from '@/styles/ui.module.css'

// Edit a store row's rate, quantity and low-stock alert. A quantity change is recorded as an
// adjustment, so it shows in the product's history and in reports.
export default function EditItemModal({ item, onClose, onDone }) {
  const { toast } = useConfirm()
  const [form, setForm] = useState({
    rate: String(item.rate),
    quantity: String(item.quantity),
    lowStockAt: String(item.lowStockAt),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const change = (parseFloat(form.quantity) || 0) - item.quantity

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    const values = { rate: parseFloat(form.rate), quantity: parseFloat(form.quantity), lowStockAt: parseFloat(form.lowStockAt) || 0 }
    if (!(values.rate >= 0) || !(values.quantity >= 0)) { setError('Rate and quantity must be 0 or more.'); return }
    setSaving(true); setError('')
    try {
      await api(`/api/items/${item.id}`, { method: 'PUT', body: values })
      toast(`${item.name} updated`)
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit item"
      subtitle={`${item.name} · ${item.unit}${item.owner !== '—' ? ` · owner: ${item.owner}` : ''}`}
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="edit-item" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : 'Save changes'}
          </button>
        </>
      )}
    >
      <form id="edit-item" className={ui.form} onSubmit={submit}>
        <div className={ui.formRow2}>
          <Field label={`Rate (UGX per ${item.unit})`}>
            <input type="number" min="0" inputMode="decimal" className={ui.input} value={form.rate} onChange={e => set('rate', e.target.value)} autoFocus />
          </Field>
          <Field label="Quantity in store">
            <input type="number" min="0" inputMode="decimal" className={ui.input} value={form.quantity} onChange={e => set('quantity', e.target.value)} />
          </Field>
        </div>
        <Field label="Low stock alert at" hint="The item is flagged as low once its balance is at or below this. 0 turns the alert off.">
          <input type="number" min="0" inputMode="decimal" className={ui.input} value={form.lowStockAt} onChange={e => set('lowStockAt', e.target.value)} />
        </Field>
        {change !== 0 && Number.isFinite(change) && (
          <div className={`${ui.alert} ${ui.alertWarning}`}>
            <IconInfoCircle size={17} />
            <span>
              The balance changes by <strong>{fmtSigned(change)} {item.unit}</strong>. This is recorded as an adjustment in the
              product&apos;s history and in reports. It does not change the note the stock came in on: to correct a
              delivery note, use <strong>Edit note</strong> on it in Documents.
            </span>
          </div>
        )}
        <p className={ui.hint}>To rename the product or change its unit, edit it under Products.</p>
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
