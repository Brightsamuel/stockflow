'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/dashboard/store.module.css'

export default function UsersManager({ initialUsers, currentUserId, currentUserRole }) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('STANDARD')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allowedRoles = currentUserRole === 'SUPER_ADMIN'
    ? ['STANDARD', 'ADMIN', 'SUPER_ADMIN']
    : ['STANDARD', 'ADMIN']

  useEffect(() => {
    if (!allowedRoles.includes(role)) {
      setRole(allowedRoles[0])
    }
  }, [allowedRoles, role])

  async function refresh() {
    const res = await fetch('/api/users')
    const data = await res.json()
    if (Array.isArray(data)) setUsers(data)
    router.refresh()
  }

  async function submit(e) {
    e.preventDefault()
    if (!username.trim() || !password) { setError('Username and password required.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsername(''); setPassword(''); setRole('STANDARD')
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(userId, next) {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteUser(userId) {
    if (!confirm('Permanently delete this user? This cannot be undone.')) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await refresh()
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
          <h2 className={styles.storeName}>Users</h2>
          <span className={styles.storeMeta}>Manage who can sign in and make changes</span>
        </div>
      </div>

      <div className={styles.content}>
        <form onSubmit={submit} className={styles.field} style={{ maxWidth: 480, marginBottom: 24 }}>
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} />

          <label style={{ marginTop: 12 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />

          <label style={{ marginTop: 12 }}>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            {allowedRoles.map(option => (
              <option key={option} value={option}>
                {option === 'STANDARD' ? 'Standard' : option === 'ADMIN' ? 'Admin' : 'Super Admin'}
              </option>
            ))}
          </select>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button type="submit" className={styles.btnPrimary} disabled={loading} style={{ marginTop: 12 }}>
            {loading ? 'Adding…' : 'Add user'}
          </button>
        </form>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className={styles.itemName}>
                    {u.username} {u.id === currentUserId && <span className={styles.fieldHint}>(you)</span>}
                  </td>
                  <td className={styles.mono}>{u.role}</td>
                  <td>
                    {u.isActive ? (
                      <span className={styles.badgeOk}>Active</span>
                    ) : (
                      <span className={styles.badgeLow}>Deactivated</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.btnGhost}
                        onClick={() => toggleActive(u.id, !u.isActive)}
                        disabled={loading || u.id === currentUserId}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                      {currentUserRole === 'SUPER_ADMIN' && u.id !== currentUserId && (
                        <button
                          className={`${styles.btnGhost} ${styles.iconBtnDanger}`}
                          onClick={() => deleteUser(u.id)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}