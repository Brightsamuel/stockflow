'use client'
import { useState } from 'react'
import { IconAlertCircle, IconKey, IconShieldLock, IconUserCircle } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Field from '@/components/ui/Field'
import Badge from '@/components/ui/Badge'
import PasswordInput from '@/components/PasswordInput'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { MIN_PASSWORD_LENGTH, ROLE_LABEL } from '@/lib/constants'
import { fmtDate, initials } from '@/lib/format'
import ui from '@/styles/ui.module.css'

const ROLE_TONE = { STANDARD: 'neutral', ADMIN: 'info', SUPER_ADMIN: 'brand' }

export default function ChangePasswordForm({ user }) {
  const { toast } = useConfirm()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!currentPassword || !newPassword) { setError('Fill in every field.'); return }
    if (newPassword.length < MIN_PASSWORD_LENGTH) { setError(`The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return }
    if (newPassword !== confirmPassword) { setError("The new passwords don't match."); return }

    setSaving(true)
    try {
      await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      toast('Password changed. Any other devices have been signed out.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="My account" subtitle="Your profile and sign-in details" />
      <div className={`${ui.page} ${ui.pageMedium}`}>
        <div className={ui.split}>
          <form onSubmit={submit}>
            <Card
              title="Change password"
              icon={IconKey}
              subtitle="Changing it signs you out on every other device"
              footer={(
                <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
                  {saving ? <><span className={ui.spinner} /> Saving…</> : 'Change password'}
                </button>
              )}
            >
              <div className={ui.form}>
                <Field label="Current password" required>
                  <PasswordInput value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoFocus />
                </Field>
                <Field
                  label="New password"
                  required
                  hint={tooShort ? `${MIN_PASSWORD_LENGTH - newPassword.length} more character${MIN_PASSWORD_LENGTH - newPassword.length === 1 ? '' : 's'} needed` : `At least ${MIN_PASSWORD_LENGTH} characters. A short phrase is easier to remember than random symbols.`}
                >
                  <PasswordInput value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
                </Field>
                <Field label="Confirm new password" required hint={mismatch ? "Doesn't match the new password yet" : undefined}>
                  <PasswordInput value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                </Field>
                {error && (
                  <div className={`${ui.alert} ${ui.alertDanger}`}>
                    <IconAlertCircle size={17} />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </Card>
          </form>

          <Card title="Profile" icon={IconUserCircle}>
            <div className={ui.stack}>
              <div className={ui.identity}>
                <span className={`${ui.avatar} ${ui.avatarLg}`}>{initials(user.username)}</span>
                <div>
                  <div className={ui.strong}>{user.username}</div>
                  <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role] ?? user.role}</Badge>
                </div>
              </div>
              <div className={ui.divider} />
              <p className={ui.hint}>Member since {fmtDate(user.createdAt)}.</p>
              <div className={`${ui.alert} ${ui.alertNeutral}`}>
                <IconShieldLock size={17} />
                <span>After 5 wrong passwords in a row the account locks for 15 minutes. An admin can unlock it sooner from Users.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
