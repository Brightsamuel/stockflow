'use client'
import { useState } from 'react'

// Password field with our own show/hide toggle. The browser's built-in reveal
// button (Edge) is hidden in globals.css so only this one appears.
export default function PasswordInput({ value, onChange, autoComplete = 'current-password', ...rest }) {
  const [show, setShow] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...rest}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        style={{ width: '100%', boxSizing: 'border-box', paddingRight: 32 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        title={show ? 'Hide password' : 'Show password'}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', padding: 0,
        }}
        tabIndex={-1}
      >
        <i className={`ti ${show ? 'ti-eye-off' : 'ti-eye'}`} />
      </button>
    </div>
  )
}
