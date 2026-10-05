'use client'
import { useEffect, useState } from 'react'
import { IconHash } from '@tabler/icons-react'
import { api } from '@/lib/api'
import { fmtDate, plural } from '@/lib/format'
import Badge from '@/components/ui/Badge'
import ui from '@/styles/ui.module.css'

const KIND_TONE = { Receipt: 'success', Issue: 'warning', Transfer: 'info', Return: 'teal' }

// Ref no. box with suggestions as you type; an empty box lists the most recent ref nos.
// The list shown is always the answer to the latest request for exactly what is typed, made
// when the box was last opened, so a ref no. deleted since an earlier search never reappears.
export default function RefSearch({ value, onChange, onPick, autoFocus = false, placeholder = 'Type to search, e.g. RCT-0091' }) {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(0) // bumped each time the box opens, to fetch afresh
  const [found, setFound] = useState({ query: null, opened: -1, items: [] })
  const q = value.trim()

  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => {
      api(`/api/receipts${q ? `?q=${encodeURIComponent(q)}` : ''}`, { signal: controller.signal })
        .then(data => setFound({ query: q, opened, items: Array.isArray(data) ? data : [] }))
        .catch(e => { if (e.name !== 'AbortError') setFound({ query: q, opened, items: [] }) })
    }, 220)
    return () => { clearTimeout(timer); controller.abort() }
  }, [q, open, opened])

  const current = found.query === q && found.opened === opened
  const results = current ? found.items : []

  function show() {
    if (!open) setOpened(n => n + 1)
    setOpen(true)
  }

  function pick(refNo) {
    setOpen(false)
    onPick(refNo)
  }

  return (
    <div className={ui.inputWrap}>
      <span className={ui.inputIcon}><IconHash size={16} /></span>
      <input
        className={`${ui.input} ${ui.inputWithIcon}`}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); show() }}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
      />
      {open && (
        <div className={ui.suggest}>
          {!current ? (
            <div className={ui.suggestEmpty}><span className={ui.spinner} /> Searching…</div>
          ) : results.length === 0 ? (
            <div className={ui.suggestEmpty}>
              {q ? `No ref nos. matching "${q}".` : 'No ref nos. recorded yet.'}
            </div>
          ) : results.map(r => (
            <button
              type="button"
              key={r.id}
              className={ui.suggestItem}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(r.refNo)}
            >
              <span className={ui.suggestTop}>
                <strong>{r.refNo}</strong>
                <Badge tone={KIND_TONE[r.kind]}>{r.kind}</Badge>
              </span>
              <span className={ui.suggestMeta}>
                {fmtDate(r.date)} · {plural(r.items, 'item')} · {r.preview}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
