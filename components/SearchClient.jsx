'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconAlertCircle, IconArrowLeft, IconHistory, IconPackage, IconSearch } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Field from '@/components/ui/Field'
import ExportBar from '@/components/ui/ExportBar'
import ReportDocument from '@/components/ui/ReportDocument'
import EmptyState from '@/components/ui/EmptyState'
import { MovementBadge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { NO_OWNER } from '@/lib/owners'
import { datePresets, fmtDate, fmtMoney, fmtNum, fmtSigned, plural } from '@/lib/format'
import { withTotals } from '@/lib/tables'
import { exportExcel, exportPdf, fileSafe } from '@/lib/exporters'
import ui from '@/styles/ui.module.css'

// Movements recorded on a received, issue or transfer note (the others are adjustments)
const NOTE_KINDS = ['IN', 'TRANSFER_IN', 'TRANSFER_OUT', 'USED', 'ISSUED']

function noteHref(row) {
  if (row.refNo) return `/notes?ref=${encodeURIComponent(row.refNo)}`
  return NOTE_KINDS.includes(row.kind) ? `/notes?log=${row.id}` : null
}

function balanceCols(ranged) {
  return [
    { label: 'Store', value: r => r.store, strong: true },
    { label: 'Category', value: r => r.category, muted: true },
    { label: 'Owner', value: r => r.owner },
    ...(ranged ? [{ label: 'Opening', value: r => r.opening, num: true, total: true }] : []),
    { label: 'Added', value: r => r.added, num: true, total: true },
    { label: 'Deducted', value: r => r.deducted, num: true, total: true },
    { label: 'Adjusted', value: r => r.adjusted, num: true, total: true, format: fmtSigned },
    { label: ranged ? 'Closing' : 'Balance', value: r => r.closing, num: true, total: true },
    { label: 'Rate (UGX)', value: r => r.rate, num: true },
    { label: 'Value (UGX)', value: r => r.value, num: true, total: true },
  ]
}

const MOVEMENT_COLS = [
  { label: 'Date', value: r => fmtDate(r.date), nowrap: true },
  { label: 'Type', value: r => r.type, render: r => <MovementBadge kind={r.kind} /> },
  { label: 'Store', value: r => r.store },
  { label: 'Owner', value: r => r.owner },
  { label: 'Change', value: r => r.change, num: true, format: fmtSigned },
  { label: 'Store balance', value: r => r.balance, num: true },
  { label: 'Rate', value: r => r.rate, num: true },
  { label: 'Value (UGX)', value: r => r.value || null, num: true },
  {
    label: 'Ref no.',
    value: r => r.refNo,
    nowrap: true,
    render: r => {
      const href = noteHref(r)
      if (!href) return '—'
      return r.refNo
        ? <Link href={href} className={`${ui.link} ${ui.mono}`}>{r.refNo}</Link>
        : <Link href={href} className={ui.link} title="Saved without a ref no.: open its note">Note</Link>
    },
  },
  { label: 'Details', value: r => r.note, muted: true },
  { label: 'Taken by', value: r => r.takenBy },
  { label: 'By', value: r => r.by, muted: true },
]

// The summary above the tables: on screen and in print as tiles, in PDF / Excel as header lines
function summaryItems(history, filters) {
  const { summary: s, product } = history
  const ranged = Boolean(filters.from || filters.to)
  const qty = n => `${fmtNum(n)} ${product.unit}`
  return [
    [ranged ? `Opening, ${filters.from ? fmtDate(filters.from) : 'first record'}` : 'Opening balance', qty(s.opening)],
    ['Received', fmtSigned(s.received)],
    ['Used on projects', fmtSigned(-s.used)],
    ['Issued externally', fmtSigned(-s.issued)],
    ...(s.transferred ? [['Moved between stores', fmtNum(s.transferred)]] : []),
    ['Adjustments', fmtSigned(s.adjusted)],
    [ranged ? `Closing, ${filters.to ? fmtDate(filters.to) : 'today'}` : 'Balance now', qty(s.closing)],
    ['Closing value', fmtMoney(s.closingValue)],
  ]
}

function historyQuery({ ownerId, from, to }) {
  const params = new URLSearchParams()
  if (ownerId) params.set('ownerId', ownerId)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return params.toString()
}

// Product history: search a product, then see its balances and every movement for any period,
// and print, save as PDF or export them. History is permanent; nothing here can delete it.
export default function SearchClient({ owners = [], settings, initialHistory = null, initialFilters = {} }) {
  const presets = datePresets()
  const [q, setQ] = useState(initialHistory?.product.name ?? '')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [results, setResults] = useState(null)
  const [history, setHistory] = useState(initialHistory)
  const [filters, setFilters] = useState({ ownerId: initialFilters.ownerId ?? '', from: initialFilters.from ?? '', to: initialFilters.to ?? '' })
  const [shown, setShown] = useState({ ownerId: initialFilters.ownerId ?? '', from: initialFilters.from ?? '', to: initialFilters.to ?? '' })
  const [order, setOrder] = useState('newest')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const term = q.trim()

  useEffect(() => {
    if (term.length < 2) return undefined
    const timer = setTimeout(() => {
      api(`/api/search?lite=1&q=${encodeURIComponent(term)}`)
        .then(data => setSuggestions(Array.isArray(data) ? data : []))
        .catch(() => setSuggestions([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [term])

  // Keeps the address bar in step (so the page can be bookmarked or refreshed) without a reload
  function setAddress(productId, next = filters) {
    if (!productId) {
      window.history.replaceState(null, '', '/search')
      return
    }
    const params = new URLSearchParams({ product: productId })
    if (next.ownerId) params.set('owner', next.ownerId)
    if (next.from) params.set('from', next.from)
    if (next.to) params.set('to', next.to)
    window.history.replaceState(null, '', `/search?${params}`)
  }

  async function openProduct(productId, next = filters) {
    setLoading(true); setError(''); setShowSuggestions(false)
    try {
      const query = historyQuery(next)
      const data = await api(`/api/products/${productId}/logs${query ? `?${query}` : ''}`)
      setHistory(data)
      setShown(next)
      setQ(data.product.name)
      setAddress(productId, next)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function runSearch(e, next = filters) {
    e?.preventDefault()
    if (!term) return
    setLoading(true); setError(''); setShowSuggestions(false)
    try {
      const params = new URLSearchParams({ q: term })
      if (next.ownerId) params.set('ownerId', next.ownerId)
      const data = await api(`/api/search?${params}`)
      setResults(Array.isArray(data) ? data : [])
      setHistory(null)
      setAddress(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Owner and period apply straight away to the history on screen
  function changeFilters(patch) {
    const next = { ...filters, ...patch }
    setFilters(next)
    if (next.from && next.to && next.from > next.to) {
      setError('The From date must be on or before the To date.')
      return
    }
    setError('')
    if (history) openProduct(history.product.id, next)
    else if (results && 'ownerId' in patch) runSearch(null, next)
  }

  function backToResults() {
    setHistory(null)
    setAddress(null)
  }

  const ranged = Boolean(shown.from || shown.to)
  const ownerLabel = shown.ownerId === NO_OWNER ? 'No owner' : owners.find(o => o.id === shown.ownerId)?.name
  const period = ranged
    ? `${shown.from ? fmtDate(shown.from) : 'First record'} – ${shown.to ? fmtDate(shown.to) : fmtDate(new Date())}`
    : `All time, as at ${fmtDate(new Date())}`
  const subtitle = history && [`Unit: ${history.product.unit}`, ownerLabel && `Owner: ${ownerLabel}`, period].filter(Boolean).join(' · ')
  const summary = history ? summaryItems(history, shown) : []
  const movements = history ? (order === 'newest' ? [...history.rows].reverse() : history.rows) : []
  const sections = history ? withTotals([
    { title: ranged ? 'Balances for the period' : 'Balances', sheet: 'Balances', cols: balanceCols(ranged), rows: history.balances, empty: 'No stock and no movements in this period.' },
    { title: 'Movements', sheet: 'Movements', cols: MOVEMENT_COLS, rows: movements, empty: ranged ? 'No movements in this period.' : 'No movements recorded yet.', totals: false },
  ]) : []
  const exportArgs = history && {
    title: `Product history · ${history.product.name}`,
    subtitle,
    meta: summary,
    settings,
    fileBase: `history-${fileSafe(history.product.name)}${shown.from || shown.to ? `-${shown.from || 'start'}-to-${shown.to || 'today'}` : ''}`,
    sections,
  }
  const activePreset = !filters.from && !filters.to ? 'All time' : presets.find(p => p.from === filters.from && p.to === filters.to)?.label

  return (
    <>
      <PageHeader title="Product history" subtitle="Every movement of a product across all stores, for any period, from the opening balance to today" />

      <div className={ui.page}>
        <form className={ui.card} onSubmit={runSearch} data-no-print>
          <div className={`${ui.cardBody} ${ui.stack}`}>
            <div className={`${ui.row} ${ui.rowEnd}`}>
              <div className={`${ui.field} ${ui.fieldProduct}`}>
                <span className={ui.label}>Product</span>
                <div className={ui.inputWrap}>
                  <span className={ui.inputIcon}><IconSearch size={16} /></span>
                  <input
                    className={`${ui.input} ${ui.inputWithIcon}`}
                    value={q}
                    onChange={e => { setQ(e.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setShowSuggestions(false)}
                    onKeyDown={e => { if (e.key === 'Escape') setShowSuggestions(false) }}
                    placeholder="Start typing a product name, e.g. cement"
                    aria-label="Product name"
                    autoFocus={!initialHistory}
                  />
                  {showSuggestions && term.length >= 2 && suggestions.length > 0 && (
                    <div className={ui.suggest}>
                      {suggestions.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className={ui.suggestItem}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => openProduct(p.id)}
                        >
                          <span className={ui.suggestTop}><strong>{p.name}</strong><span className={ui.suggestMeta}>{p.unit.name}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Field label="Stock owner" className={ui.fieldOwner}>
                <select className={ui.input} value={filters.ownerId} onChange={e => changeFilters({ ownerId: e.target.value })}>
                  <option value="">All owners</option>
                  <option value={NO_OWNER}>No owner</option>
                  {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
              <Field label="From" className={ui.fieldDate}>
                <input type="date" className={ui.input} value={filters.from} max={filters.to || undefined} onChange={e => changeFilters({ from: e.target.value })} />
              </Field>
              <Field label="To" className={ui.fieldDate}>
                <input type="date" className={ui.input} value={filters.to} min={filters.from || undefined} onChange={e => changeFilters({ to: e.target.value })} />
              </Field>
              <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={loading || !term}>
                {loading ? <span className={ui.spinner} /> : <IconSearch size={16} />} Search
              </button>
            </div>
            <div className={ui.presets} role="group" aria-label="Period">
              {[{ label: 'All time', from: '', to: '' }, ...presets].map(p => (
                <button
                  key={p.label}
                  type="button"
                  className={`${ui.preset} ${activePreset === p.label ? ui.presetActive : ''}`}
                  aria-pressed={activePreset === p.label}
                  onClick={() => changeFilters({ from: p.from, to: p.to })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </form>

        {error && (
          <div className={`${ui.alert} ${ui.alertDanger}`} data-no-print>
            <IconAlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        {!history && results && (
          <section className={`${ui.card} ${ui.cardFlush}`} data-no-print>
            <div className={ui.cardHeader}>
              <h2 className={ui.cardTitle}><IconPackage size={17} /> {plural(results.length, 'product')} matching &quot;{term}&quot;</h2>
            </div>
            {results.length === 0 ? (
              <EmptyState icon={IconSearch} title="No products found">Try a shorter or different name.</EmptyState>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Unit</th>
                      <th className={ui.num}>Stores holding it</th>
                      <th className={ui.num}>Total balance</th>
                      <th className={ui.num}>Value (UGX)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(p => {
                      const balance = p.entries.reduce((s, e) => s + e.quantity, 0)
                      const value = p.entries.reduce((s, e) => s + e.quantity * e.rate, 0)
                      const stores = p.entries.filter(e => !e.store.category.isSystem).length
                      return (
                        <tr key={p.id}>
                          <td className={ui.cellStrong}>{p.name}</td>
                          <td className={ui.cellMuted}>{p.unit.name}</td>
                          <td className={ui.num}>{fmtNum(stores)}</td>
                          <td className={ui.num}>{fmtNum(balance)}</td>
                          <td className={ui.num}>{fmtNum(value)}</td>
                          <td>
                            <div className={ui.cellActions}>
                              <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => openProduct(p.id)}>
                                <IconHistory size={15} /> View history
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!history && !results && (
          <section className={ui.card} data-no-print>
            <EmptyState icon={IconHistory} title="Look up a product">
              Search for a product to see where it is held and every movement it has had: received, transferred, used on
              projects, issued and adjusted. Pick a period to see the opening and closing balance for it. The history
              can be printed, saved as a PDF or exported to Excel.
            </EmptyState>
          </section>
        )}

        {history && (
          <>
            {results && (
              <div data-no-print>
                <button type="button" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSm}`} onClick={backToResults}>
                  <IconArrowLeft size={16} /> Back to results
                </button>
              </div>
            )}

            <ExportBar
              info={(
                <>
                  <strong className={ui.strong}>{plural(history.rows.length, 'movement')}</strong>
                  <div className={ui.segmented} role="group" aria-label="Order">
                    {[['newest', 'Newest first'], ['oldest', 'Oldest first']].map(([id, label]) => (
                      <button key={id} type="button" className={`${ui.segment} ${order === id ? ui.segmentActive : ''}`} aria-pressed={order === id} onClick={() => setOrder(id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              onPdf={() => exportPdf(exportArgs)}
              onExcel={() => exportExcel(exportArgs)}
            />

            <div className={loading ? ui.busy : undefined} aria-busy={loading}>
              <ReportDocument
                title={`Product history · ${history.product.name}`}
                subtitle={subtitle}
                settings={settings}
                sections={sections}
                chips={(
                  <div className={ui.summaryStats}>
                    {summary.map(([label, value]) => (
                      <div key={label} className={ui.miniStat}>
                        <div className={ui.miniLabel}>{label}</div>
                        <div className={ui.miniValue}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}
