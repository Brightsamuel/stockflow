'use client'
import { useState } from 'react'
import { IconEye, IconEyeOff } from '@tabler/icons-react'
import ui from '@/styles/ui.module.css'

// Password field with our own show/hide toggle. The browser's built-in reveal
// button (Edge) is hidden in globals.css so only this one appears.
export default function PasswordInput({ value, onChange, autoComplete = 'current-password', className = '', ...rest }) {
  const [show, setShow] = useState(false)

  return (
    <span className={ui.inputWrap}>
      <input
        {...rest}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={`${ui.input} ${ui.inputWithAction} ${className}`}
      />
      <button
        type="button"
        className={ui.inputAction}
        onClick={() => setShow(s => !s)}
        title={show ? 'Hide password' : 'Show password'}
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? <IconEyeOff size={17} /> : <IconEye size={17} />}
      </button>
    </span>
  )
}
