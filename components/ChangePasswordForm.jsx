'use client'
import { useState } from 'react'
import PasswordInput from '@/components/PasswordInput'
import styles from '@/dashboard/store.module.css'

export default function ChangePasswordForm({ username }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(''); setSaved(false)
    if (!currentPassword || !newPassword) { setError('Fill in all fields.'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
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
          <h2 className={styles.storeName}>My account</h2>
          <span className={styles.storeMeta}>Signed in as {username}</span>
        </div>
      </div>

      <div className={styles.content}>
        <form onSubmit={submit} className={styles.field} style={{ maxWidth: 480 }}>
          <h3 style={{ marginBottom: 8 }}>Change password</h3>

          <label>Current password</label>
          <PasswordInput value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoFocus />

          <label style={{ marginTop: 12 }}>New password</label>
          <PasswordInput value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />

          <label style={{ marginTop: 12 }}>Confirm new password</label>
          <PasswordInput value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />

          {error && <p className={styles.errorMsg}>{error}</p>}
          {saved && <p className={styles.fieldHint} style={{ color: 'var(--success)' }}>Password changed.</p>}

          <button type="submit" className={styles.btnPrimary} disabled={loading} style={{ marginTop: 12 }}>
            {loading ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </>
  )
}
