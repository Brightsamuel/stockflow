'use client'
import { useEffect, useState } from 'react'
import { IconHash } from '@tabler/icons-react'
import { api } from '@/lib/api'
import { fmtDate, plural } from '@/lib/format'
import Badge from '@/components/ui/Badge'
import ui from '@/styles/ui.module.css'

const KIND_TONE = { Receipt: 'success', Issue: 'warning', Transfer: 'info' }

// Ref no. box with suggestions as you type; an empty box lists the most recent ref nos
export default function RefSearch({ value, onChange, onPick, autoFocus = false, placeholder = 'Type to search, e.g. RCT-0091' }) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])

  useEffect(() => {
    if (!open) return undefined
    const q = value.trim()
    const timer = setTimeout(() => {
      api(`/api/receipts${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        .then(data => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
    }, 220)
    return () => clearTimeout(timer)
  }, [value, open])

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
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
      />
      {open && (
        <div className={ui.suggest}>
          {results.length === 0 ? (
            <div className={ui.suggestEmpty}>
              {value.trim() ? `No ref nos. matching "${value.trim()}".` : 'No ref nos. recorded yet.'}
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
