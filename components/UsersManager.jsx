'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/dashboard/store.module.css'

export default function UsersManager({ initialUsers, currentUserId }) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
        body: JSON.stringify({ username: username.trim(), password, isAdmin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsername(''); setPassword(''); setIsAdmin(false)
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

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 12 }}>
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
            Grant admin access
          </label>

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
                  <td className={styles.mono}>{u.isAdmin ? 'Admin' : 'Standard'}</td>
                  <td>
                    {u.isActive ? (
                      <span className={styles.badgeOk}>Active</span>
                    ) : (
                      <span className={styles.badgeLow}>Deactivated</span>
                    )}
                  </td>
                  <td>
                    <button
                      className={styles.btnGhost}
                      onClick={() => toggleActive(u.id, !u.isActive)}
                      disabled={loading || u.id === currentUserId}
                    >
                      {u.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
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