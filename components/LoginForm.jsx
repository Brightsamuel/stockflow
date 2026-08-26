'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/dashboard/store.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  // const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <form onSubmit={submit} className={styles.field} style={{ width: 320 }}>
        <h2 style={{ marginBottom: 16 }}>Sign in</h2>
        <label>Username</label>
        <input value={username} onChange={e => setUsername(e.target.value)} autoFocus />
        {/* <label style={{ marginTop: 12 }}>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ paddingRight: 30 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
              }}
              tabIndex={-1}
            >
              <i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} />
            </button>
          </div> */}
        <label style={{ marginTop: 12 }}>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className={styles.errorMsg}>{error}</p>}
        <button type="submit" className={styles.btnPrimary} disabled={loading} style={{ marginTop: 16 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className={styles.fieldHint} style={{ marginTop: 12 }}>
          No account yet? Sign in with any username/password to create the first admin account.
        </p>
      </form>
    </div>
  )
}