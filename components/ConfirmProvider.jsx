'use client'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { IconAlertTriangle, IconArrowRight, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import ui from '@/styles/ui.module.css'

const ConfirmContext = createContext(null)
let nextToastId = 0

// App-wide dialogs and notifications:
//   confirm(message | { title, message, confirmLabel, cancelLabel, danger, requireText }) → Promise<boolean>
//   notify(message) → Promise (an OK-only notice)
//   toast(message, { type: 'success' | 'error', action: { label, href } })
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const confirm = useCallback(options => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise(resolve => setDialog({ ...opts, resolve, inputValue: '' }))
  }, [])

  const notify = useCallback(message => new Promise(resolve => setDialog({ message, isAlert: true, resolve })), [])

  const dismissToast = useCallback(id => {
    setToasts(list => list.filter(t => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const toast = useCallback((message, { type = 'success', action, duration } = {}) => {
    const id = ++nextToastId
    setToasts(list => [...list.slice(-3), { id, message, type, action }])
    timers.current.set(id, setTimeout(() => dismissToast(id), duration ?? (action ? 10000 : 5000)))
  }, [dismissToast])

  function close(result) {
    dialog?.resolve(result)
    setDialog(null)
  }

  const value = useMemo(() => ({ confirm, notify, toast }), [confirm, notify, toast])
  const confirmDisabled = dialog?.requireText && dialog.inputValue !== dialog.requireText

  return (
    <ConfirmContext.Provider value={value}>
      {children}

      {dialog && (
        <Modal
          title={dialog.title || (dialog.isAlert ? 'Notice' : 'Please confirm')}
          onClose={() => close(dialog.isAlert ? true : false)}
          closeOnBackdrop={!dialog.isAlert}
          footer={dialog.isAlert ? (
            <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => close(true)} autoFocus>OK</button>
          ) : (
            <>
              <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => close(false)}>
                {dialog.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                className={`${ui.btn} ${dialog.danger ? ui.btnDanger : ui.btnPrimary}`}
                onClick={() => close(true)}
                disabled={confirmDisabled}
                autoFocus={!dialog.requireText}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </>
          )}
        >
          <div className={ui.dialogRow}>
            <span className={`${ui.dialogIcon} ${dialog.danger ? ui.toneDanger : ui.toneInfo}`}>
              {dialog.danger ? <IconAlertTriangle size={20} /> : <IconInfoCircle size={20} />}
            </span>
            <p className={ui.dialogMessage}>{dialog.message}</p>
          </div>
          {dialog.requireText && (
            <label className={ui.field}>
              <span className={ui.label}>Type &quot;{dialog.requireText}&quot; to confirm</span>
              <input
                autoFocus
                className={ui.input}
                value={dialog.inputValue}
                onChange={e => setDialog(d => ({ ...d, inputValue: e.target.value }))}
              />
            </label>
          )}
        </Modal>
      )}

      <div className={ui.toasts} data-no-print aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`${ui.toast} ${t.type === 'error' ? ui.toastError : ''}`} role="status">
            <span className={ui.toastIcon}>
              {t.type === 'error' ? <IconAlertTriangle size={18} /> : <IconCircleCheck size={18} />}
            </span>
            <div className={ui.toastBody}>
              <div>{t.message}</div>
              {t.action && (
                <Link href={t.action.href} className={ui.toastAction} onClick={() => dismissToast(t.id)}>
                  {t.action.label} <IconArrowRight size={14} />
                </Link>
              )}
            </div>
            <button type="button" className={ui.toastClose} onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
