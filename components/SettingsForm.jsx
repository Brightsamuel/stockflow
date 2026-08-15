// components/SettingsForm.jsx
'use client'
import { useState } from 'react'
import styles from '@/dashboard/store.module.css'

export default function SettingsForm({ initialSettings }) {
  const [form, setForm] = useState({
    companyName: initialSettings.companyName || '',
    address: initialSettings.address || '',
    phone: initialSettings.phone || '',
    email: initialSettings.email || '',
    logoUrl: initialSettings.logoUrl || '',
  })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); setSaved(false) }

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <h2 className={styles.storeName}>Settings</h2>
          <span className={styles.storeMeta}>Shown on the header of printed and PDF reports</span>
        </div>
      </div>
      <div className={styles.content}>
        <form onSubmit={submit} className={styles.field} style={{ maxWidth: 480 }}>
          <label>Company name</label>
          <input value={form.companyName} onChange={e => set('companyName', e.target.value)} />

          <label style={{ marginTop: 12 }}>Address</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, City, Country" />

          <div className={styles.fieldRow} style={{ marginTop: 12 }}>
            <div className={styles.field}>
              <label>Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Email</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          <label style={{ marginTop: 12 }}>Logo URL (optional)</label>
          <input value={form.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://…" />

          {error && <p className={styles.errorMsg}>{error}</p>}
          {saved && <p className={styles.fieldHint}>Saved.</p>}

          <button type="submit" className={styles.btnPrimary} disabled={loading} style={{ marginTop: 16 }}>
            {loading ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      </div>
    </>
  )
}