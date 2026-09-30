'use client'
import { useState } from 'react'
import { IconAlertCircle, IconArrowRight, IconBuildingWarehouse, IconClipboardList, IconInfoCircle, IconPrinter, IconTransfer } from '@tabler/icons-react'
import Field from '@/components/ui/Field'
import PasswordInput from '@/components/PasswordInput'
import { api } from '@/lib/api'
import { MIN_PASSWORD_LENGTH } from '@/lib/constants'
import ui from '@/styles/ui.module.css'
import styles from '@/app/login/login.module.css'

const FEATURES = [
  { icon: IconTransfer, title: 'Every store in one place', text: 'Stock in, transfers and stock out with ref nos. and owners.' },
  { icon: IconClipboardList, title: 'Field records', text: 'What went to each project, and who took it.' },
  { icon: IconPrinter, title: 'Ready for the office', text: 'Reports and signed notes to print, save as PDF or open in Excel.' },
]

export default function LoginForm({ firstRun, companyName, logoUrl }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!username.trim() || !password) { setError('Enter your username and password.'); return }
    if (firstRun && password.length < MIN_PASSWORD_LENGTH) { setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`); return }
    setLoading(true); setError('')
    try {
      await api('/api/auth/login', { method: 'POST', body: { username, password } })
      // A full page load starts the signed-in app fresh
      window.location.assign('/')
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className={styles.screen}>
      <aside className={styles.brand}>
        <div className={styles.brandTop}>
          <div className={styles.logoRow}>
            <span className={styles.mark}><IconBuildingWarehouse size={24} /></span>
            <div>
              <div className={styles.appName}>StockFlow</div>
              <div className={styles.appTag}>Inventory, transfers and field records</div>
            </div>
          </div>
        </div>

        <div className={styles.brandMiddle}>
          <h1 className={styles.headline}>Know what&apos;s in every store, <span>and where it went.</span></h1>
          <p className={styles.lead}>
            {companyName ? `${companyName}'s` : 'Your'} stock across all stores, projects and suppliers, with a complete history that is never lost.
          </p>
          <ul className={styles.features}>
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className={styles.feature}>
                <span className={styles.featureIcon}><Icon size={17} /></span>
                <span><strong>{title}</strong>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.brandBottom}>© {new Date().getFullYear()} {companyName || 'StockFlow'}</div>
      </aside>

      <main className={styles.formSide}>
        <div className={styles.card}>
          {(logoUrl || companyName) && (
            <div className={styles.company}>
              {logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logoUrl} alt={companyName || 'Company logo'} className={styles.companyLogo} />
                : <span className={styles.companyName}>{companyName}</span>}
            </div>
          )}

          <h2 className={styles.title}>{firstRun ? 'Set up StockFlow' : 'Sign in'}</h2>
          <p className={styles.subtitle}>
            {firstRun ? 'Create the first account. It becomes the Super admin.' : 'Welcome back. Enter your details to continue.'}
          </p>

          <form className={ui.form} onSubmit={submit}>
            <Field label="Username">
              <input className={ui.input} value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </Field>
            <Field label="Password" hint={firstRun ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}>
              <PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete={firstRun ? 'new-password' : 'current-password'} />
            </Field>

            {error && (
              <div className={`${ui.alert} ${ui.alertDanger}`} role="alert">
                <IconAlertCircle size={17} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className={`${ui.btn} ${ui.btnPrimary} ${ui.btnLg} ${ui.btnBlock}`} disabled={loading}>
              {loading ? <><span className={ui.spinner} /> Signing in…</> : <>{firstRun ? 'Create account' : 'Sign in'} <IconArrowRight size={17} /></>}
            </button>

            {firstRun && (
              <div className={`${ui.alert} ${ui.alertInfo}`}>
                <IconInfoCircle size={17} />
                <span>No accounts exist yet. The username and password you enter now create the Super admin account.</span>
              </div>
            )}
          </form>

          <p className={styles.footnote}>Forgot your password? Ask an administrator to reset it.</p>
        </div>
      </main>
    </div>
  )
}
