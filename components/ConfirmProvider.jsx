'use client'
import { createContext, useContext, useState, useCallback } from 'react'
import styles from '@/dashboard/store.module.css'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)

  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : options
    return new Promise((resolve) => {
      setDialog({ ...opts, resolve, inputValue: '' })
    })
  }, [])

  const notify = useCallback((message) => {
    return new Promise((resolve) => {
      setDialog({ message, isAlert: true, resolve })
    })
  }, [])

  function close(result) {
    dialog?.resolve(result)
    setDialog(null)
  }

  const confirmDisabled = dialog?.requireText && dialog.inputValue !== dialog.requireText

  return (
    <ConfirmContext.Provider value={{ confirm, notify }}>
      {children}
      {dialog && (
        <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && !dialog.isAlert && close(false)}>
          <div className={styles.modal} style={{ maxWidth: 400 }}>
            <div className={styles.modalHeader}>
              <h3>{dialog.title || (dialog.isAlert ? 'Notice' : 'Confirm')}</h3>
              {!dialog.isAlert && (
                <button className={styles.closeBtn} onClick={() => close(false)}><i className="ti ti-x" /></button>
              )}
            </div>
            <div className={styles.modalBody}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {dialog.message}
              </p>
              {dialog.requireText && (
                <div className={styles.field}>
                  <label>Type "{dialog.requireText}" to confirm</label>
                  <input
                    autoFocus
                    value={dialog.inputValue}
                    onChange={e => setDialog(d => ({ ...d, inputValue: e.target.value }))}
                  />
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              {dialog.isAlert ? (
                <button className={styles.btnPrimary} onClick={() => close(true)}>OK</button>
              ) : (
                <>
                  <button className={styles.btnGhost} onClick={() => close(false)}>
                    {dialog.cancelLabel || 'Cancel'}
                  </button>
                  <button
                    className={styles.btnPrimary}
                    style={dialog.danger ? { background: 'var(--danger)' } : undefined}
                    onClick={() => close(true)}
                    disabled={confirmDisabled}
                  >
                    {dialog.confirmLabel || 'Confirm'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}