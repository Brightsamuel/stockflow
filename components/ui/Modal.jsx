'use client'
import { useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'
import ui from '@/styles/ui.module.css'

// Open modals, newest last, so Escape only closes the one on top
const openModals = []

const SIZE_CLASS = { md: '', lg: ui.modalLg, xl: ui.modalXl }

// Dialog with a header, a scrolling body and a sticky footer.
// dismissible: Escape and the close button call onClose (turn off while saving).
// closeOnBackdrop: clicking outside also closes (for short, low-risk dialogs).
export default function Modal({
  title, subtitle, size = 'md', onClose, footer, dismissible = true, closeOnBackdrop = false, bodyRef, children,
}) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current = dismissible ? onClose : null
  })

  useEffect(() => {
    const token = {}
    openModals.push(token)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(e) {
      if (e.key === 'Escape' && openModals[openModals.length - 1] === token) closeRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openModals.splice(openModals.indexOf(token), 1)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div
      className={ui.backdrop}
      data-no-print
      onMouseDown={e => { if (closeOnBackdrop && e.target === e.currentTarget) closeRef.current?.() }}
    >
      <div className={`${ui.modal} ${SIZE_CLASS[size] ?? ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className={ui.modalHeader}>
          <div>
            <h2 className={ui.modalTitle}>{title}</h2>
            {subtitle && <p className={ui.modalSubtitle}>{subtitle}</p>}
          </div>
          {onClose && (
            <button type="button" className={ui.iconBtn} onClick={() => closeRef.current?.()} disabled={!dismissible} aria-label="Close">
              <IconX size={18} />
            </button>
          )}
        </div>
        <div className={ui.modalBody} ref={bodyRef}>{children}</div>
        {footer && <div className={ui.modalFooter}>{footer}</div>}
      </div>
    </div>
  )
}
