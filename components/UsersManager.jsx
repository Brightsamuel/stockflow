'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertCircle, IconKey, IconLock, IconLockOpen, IconShieldCheck, IconTrash, IconUserCheck, IconUserOff, IconUserPlus, IconUsers } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import Badge from '@/components/ui/Badge'
import PasswordInput from '@/components/PasswordInput'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { MIN_PASSWORD_LENGTH, ROLE_LABEL } from '@/lib/constants'
import { fmtDate, fmtNum, initials } from '@/lib/format'
import ui from '@/styles/ui.module.css'

const ROLE_TONE = { STANDARD: 'neutral', ADMIN: 'info', SUPER_ADMIN: 'brand' }
const ROLE_HELP = {
  STANDARD: 'Works in the stores: stock in, transfers, stock out, reports.',
  ADMIN: 'Also manages stores, categories, lists, users and settings.',
  SUPER_ADMIN: 'Full control, including removing items and activity tracking.',
}

function ErrorAlert({ message }) {
  if (!message) return null
  return (
    <div className={`${ui.alert} ${ui.alertDanger}`}>
      <IconAlertCircle size={17} />
      <span>{message}</span>
    </div>
  )
}

function AddUserModal({ allowedRoles, onClose, onDone }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('STANDARD')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!username.trim()) { setError('Enter a username.'); return }
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return }
    setSaving(true); setError('')
    try {
      const user = await api('/api/users', { method: 'POST', body: { username: username.trim(), password, role } })
      onDone(`${user.username} can now sign in`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Add user"
      subtitle="They sign in with this username and password"
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="add-user" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Adding…</> : 'Add user'}
          </button>
        </>
      )}
    >
      <form id="add-user" className={ui.form} onSubmit={submit}>
        <Field label="Username" required>
          <input autoFocus className={ui.input} value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Password" required hint={`At least ${MIN_PASSWORD_LENGTH} characters. Share it privately; they can change it under My account.`}>
          <PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Role" required hint={ROLE_HELP[role]}>
          <select className={ui.input} value={role} onChange={e => setRole(e.target.value)}>
            {allowedRoles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        <ErrorAlert message={error} />
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return }
    setSaving(true); setError('')
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: { password } })
      onDone(`Password for ${user.username} has been reset`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Reset password"
      subtitle={`For ${user.username}. They'll be signed out everywhere and must use the new password.`}
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="reset-password" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : 'Set password'}
          </button>
        </>
      )}
    >
      <form id="reset-password" className={ui.form} onSubmit={submit}>
        <Field label="New password" required hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
          <PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </Field>
        <ErrorAlert message={error} />
      </form>
    </Modal>
  )
}

export default function UsersManager({ users, currentUserId, currentUserRole }) {
  const router = useRouter()
  const { confirm, toast } = useConfirm()
  const [modal, setModal] = useState(null) // 'add' | { reset: user }
  const [busyId, setBusyId] = useState(null)

  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN'
  const allowedRoles = isSuperAdmin ? ['STANDARD', 'ADMIN', 'SUPER_ADMIN'] : ['STANDARD', 'ADMIN']
  const active = users.filter(u => u.isActive).length
  const admins = users.filter(u => u.role !== 'STANDARD').length

  function finish(message) {
    setModal(null)
    toast(message)
    router.refresh()
  }

  async function update(user, body, message) {
    setBusyId(user.id)
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body })
      toast(message)
      router.refresh()
    } catch (e) {
      toast(e.message, { type: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function toggleActive(user) {
    if (user.isActive) {
      const ok = await confirm({
        title: 'Deactivate user',
        message: `Deactivate ${user.username}? They'll be signed out and can't sign in until reactivated. Everything they recorded stays in the history.`,
        confirmLabel: 'Deactivate',
        danger: true,
      })
      if (!ok) return
    }
    update(user, { isActive: !user.isActive }, user.isActive ? `${user.username} deactivated` : `${user.username} reactivated`)
  }

  async function deleteUser(user) {
    const ok = await confirm({
      title: 'Delete user',
      message: `Delete ${user.username} for good? This is only possible because they have never recorded any stock activity.`,
      confirmLabel: 'Delete user',
      danger: true,
    })
    if (!ok) return
    setBusyId(user.id)
    try {
      await api(`/api/users/${user.id}`, { method: 'DELETE' })
      toast(`${user.username} deleted`)
      router.refresh()
    } catch (e) {
      toast(e.message, { type: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Who can sign in, and what they're allowed to do"
        actions={(
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setModal('add')}>
            <IconUserPlus size={17} /> Add user
          </button>
        )}
      />

      <div className={ui.page}>
        <div className={`${ui.grid} ${ui.cols3}`}>
          <StatCard icon={IconUsers} tone="info" label="Users" value={fmtNum(users.length)} />
          <StatCard icon={IconUserCheck} tone="success" label="Active" value={fmtNum(active)} hint={`${fmtNum(users.length - active)} deactivated`} />
          <StatCard icon={IconShieldCheck} tone="brand" label="Admins" value={fmtNum(admins)} hint="Admins and Super admins" />
        </div>

        <section className={`${ui.card} ${ui.cardFlush}`}>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className={ui.num}>Records</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = u.id === currentUserId
                  const canChange = !isSelf && (u.role !== 'SUPER_ADMIN' || isSuperAdmin)
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className={ui.identity}>
                          <span className={ui.avatar}>{initials(u.username)}</span>
                          <span className={ui.cellStrong}>{u.username}{isSelf && <span className={ui.cellSub}>You</span>}</span>
                        </div>
                      </td>
                      <td><Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role] ?? u.role}</Badge></td>
                      <td>
                        {!u.isActive
                          ? <Badge tone="neutral" dot>Deactivated</Badge>
                          : u.locked
                            ? <Badge tone="danger" dot title="Too many failed sign-ins">Locked</Badge>
                            : <Badge tone="success" dot>Active</Badge>}
                      </td>
                      <td className={ui.num}>{fmtNum(u.activity)}</td>
                      <td className={ui.cellMuted}>{fmtDate(u.createdAt)}</td>
                      <td>
                        <div className={ui.cellActions}>
                          {canChange && u.locked && (
                            <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => update(u, { unlock: true }, `${u.username} unlocked`)} disabled={busyId === u.id}>
                              <IconLockOpen size={15} /> Unlock
                            </button>
                          )}
                          {canChange && (
                            <button type="button" className={ui.iconBtn} title="Reset password" onClick={() => setModal({ reset: u })} disabled={busyId === u.id}>
                              <IconKey size={17} />
                            </button>
                          )}
                          {canChange && (
                            <button type="button" className={ui.iconBtn} title={u.isActive ? 'Deactivate' : 'Reactivate'} onClick={() => toggleActive(u)} disabled={busyId === u.id}>
                              {u.isActive ? <IconUserOff size={17} /> : <IconUserCheck size={17} />}
                            </button>
                          )}
                          {isSuperAdmin && !isSelf && (
                            <button
                              type="button"
                              className={`${ui.iconBtn} ${ui.iconBtnDanger}`}
                              title={u.activity ? 'Has recorded stock activity, so it can only be deactivated' : 'Delete user'}
                              onClick={() => deleteUser(u)}
                              disabled={u.activity > 0 || busyId === u.id}
                            >
                              <IconTrash size={17} />
                            </button>
                          )}
                          {!canChange && !isSelf && <span className={ui.cellMuted} title="Only a Super admin can change this account"><IconLock size={16} /></span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className={ui.cardFooter}>
            <span className={ui.hint}>
              Users who have recorded stock activity can be deactivated but not deleted, so every record keeps its author.
            </span>
          </div>
        </section>
      </div>

      {modal === 'add' && <AddUserModal allowedRoles={allowedRoles} onClose={() => setModal(null)} onDone={finish} />}
      {modal?.reset && <ResetPasswordModal user={modal.reset} onClose={() => setModal(null)} onDone={finish} />}
    </>
  )
}
