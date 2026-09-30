'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  IconAlertCircle, IconAlertTriangle, IconBuildingStore, IconFileText, IconFolders, IconHash, IconListDetails,
  IconReportAnalytics, IconTruckDelivery,
} from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Field from '@/components/ui/Field'
import ExportBar from '@/components/ui/ExportBar'
import ReportDocument from '@/components/ui/ReportDocument'
import EmptyState from '@/components/ui/EmptyState'
import { MovementBadge } from '@/components/ui/Badge'
import RefSearch from '@/components/RefSearch'
import { api } from '@/lib/api'
import { NO_OWNER } from '@/lib/owners'
import { LEDGER_TYPES } from '@/lib/movements'
import { datePresets, fmtDate, fmtMoney, fmtNum, fmtSigned, plural } from '@/lib/format'
import { withTotals } from '@/lib/tables'
import { exportExcel, exportPdf, fileSafe } from '@/lib/exporters'
import ui from '@/styles/ui.module.css'

const REPORT_TYPES = [
  { id: 'store', title: 'Store balance', text: 'Opening, received, issued and closing stock for one store', icon: IconBuildingStore },
  { id: 'category', title: 'Category balance', text: 'The same across every store in a category', icon: IconFolders },
  { id: 'ledger', title: 'Movement ledger', text: 'Every movement in a period, line by line', icon: IconListDetails },
  { id: 'external', title: 'External issues', text: 'Stock issued to people and companies outside', icon: IconTruckDelivery },
  { id: 'lowstock', title: 'Low stock', text: 'Items at or below their alert level right now', icon: IconAlertTriangle },
  { id: 'ref', title: 'Ref no. lookup', text: 'Everything recorded under one ref no.', icon: IconHash },
]

const EMPTY_TEXT = {
  store: 'No stock or activity in this period.',
  category: 'No stock or activity in this period.',
  external: 'No stock was issued to external parties in this period.',
  field: 'No stock was used on projects in this period.',
  ledger: 'No movements in this period.',
  lowstock: 'Nothing is at or below its alert level.',
  ref: 'Nothing is recorded under this ref no.',
}

const refLink = {
  label: 'Ref no.',
  value: r => r.refNo,
  mono: true,
  nowrap: true,
  render: r => (r.refNo ? <Link href={`/notes?ref=${encodeURIComponent(r.refNo)}`} className={`${ui.link} ${ui.mono}`}>{r.refNo}</Link> : '—'),
}
const dateCol = { label: 'Date', value: r => fmtDate(r.date), nowrap: true }
const owner = { label: 'Owner', value: r => r.ownerName ?? r.owner }

// Columns per report type, shared by the screen, print, PDF and Excel.
function columnsFor(scope) {
  switch (scope) {
    case 'store':
    case 'category':
      return [
        ...(scope === 'category' ? [{ label: 'Store', value: r => r.storeName }] : []),
        { label: 'Product', value: r => r.productName, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, muted: true },
        { label: 'Opening', value: r => r.opening, num: true, total: true },
        { label: 'Added', value: r => r.added, num: true, total: true },
        { label: 'Deducted', value: r => r.deducted, num: true, total: true },
        { label: 'Adjusted', value: r => r.adjusted, num: true, total: true, format: fmtSigned },
        { label: 'Closing', value: r => r.closing, num: true, total: true },
        { label: 'Rate', value: r => r.rate, num: true },
        { label: 'Closing value (UGX)', value: r => r.closingValue, num: true, total: true },
      ]
    case 'external':
      return [
        dateCol,
        refLink,
        { label: 'Recipient', value: r => r.recipientName },
        { label: 'Company', value: r => r.recipientCompany, muted: true },
        { label: 'Product', value: r => r.product, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, muted: true },
        { label: 'Qty', value: r => r.quantity, num: true },
        { label: 'Rate', value: r => r.rate, num: true },
        { label: 'Value (UGX)', value: r => r.value, num: true, total: true },
        { label: 'From store', value: r => r.store },
        { label: 'Issued by', value: r => r.issuedBy, muted: true },
      ]
    case 'field':
      return [
        dateCol,
        refLink,
        { label: 'Project', value: r => r.project },
        { label: 'From store', value: r => r.store },
        { label: 'Product', value: r => r.product, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, muted: true },
        { label: 'Qty', value: r => r.quantity, num: true },
        { label: 'Rate', value: r => r.rate, num: true },
        { label: 'Value (UGX)', value: r => r.value, num: true, total: true },
        { label: 'Taken by', value: r => r.takenBy },
        { label: 'Issued by', value: r => r.issuedBy, muted: true },
      ]
    case 'ledger':
      return [
        dateCol,
        refLink,
        { label: 'Type', value: r => r.typeLabel, render: r => <MovementBadge kind={r.kind} /> },
        { label: 'Store', value: r => r.store },
        { label: 'Product', value: r => r.product, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, muted: true },
        { label: 'Qty', value: r => r.change, num: true, format: fmtSigned },
        { label: 'Rate', value: r => r.rate, num: true },
        { label: 'Value (UGX)', value: r => r.value, num: true },
        { label: 'Details', value: r => r.details, muted: true },
        { label: 'By', value: r => r.by, muted: true },
      ]
    case 'lowstock':
      return [
        { label: 'Store', value: r => r.store },
        { label: 'Product', value: r => r.product, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, muted: true },
        { label: 'In stock', value: r => r.quantity, num: true },
        { label: 'Alert at', value: r => r.lowStockAt, num: true },
        { label: 'Short by', value: r => r.shortBy, num: true },
        { label: 'Rate', value: r => r.rate, num: true },
        { label: 'Restock value (UGX)', value: r => r.restockValue, num: true, total: true },
      ]
    default:
      return [
        dateCol,
        { label: 'Type', value: r => r.typeLabel, render: r => <MovementBadge kind={r.kind} /> },
        { label: 'Store', value: r => r.store },
        { label: 'Product', value: r => r.product, strong: true },
        owner,
        { label: 'Unit', value: r => r.unit, muted: true },
        { label: 'Qty', value: r => r.quantity, num: true },
        { label: 'Rate', value: r => r.rate, num: true },
        { label: 'Amount (UGX)', value: r => r.value, num: true, total: true },
        { label: 'To / details', value: r => r.destination ?? r.note, muted: true },
        { label: 'Taken by', value: r => r.takenBy },
        { label: 'By', value: r => r.addedBy, muted: true },
      ]
  }
}

function documentTitle(report) {
  switch (report.scope) {
    case 'store':
    case 'category': return `Stock balance · ${report.label}`
    case 'external': return `External issues · ${report.label}`
    case 'field': return `Field records · ${report.label}`
    default: return report.label
  }
}

function summaryChips(report) {
  const rows = report.rows
  const sum = key => rows.reduce((s, r) => s + (r[key] || 0), 0)
  const distinct = key => new Set(rows.map(r => r[key]).filter(Boolean)).size
  switch (report.scope) {
    case 'store':
    case 'category': return [['Rows', fmtNum(rows.length)], ['Closing value', fmtMoney(sum('closingValue'))]]
    case 'field': return [['Issues', fmtNum(rows.length)], ['Projects', fmtNum(distinct('project'))], ['People', fmtNum(distinct('takenBy'))], ['Value', fmtMoney(sum('value'))]]
    case 'external': return [['Issues', fmtNum(rows.length)], ['Recipients', fmtNum(distinct('recipientName'))], ['Value', fmtMoney(sum('value'))]]
    case 'ledger': return [['Movements', fmtNum(rows.length)], ['Products', fmtNum(distinct('product'))]]
    case 'lowstock': return [['Items low', fmtNum(rows.length)], ['Restock value', fmtMoney(sum('restockValue'))]]
    default: return [['Lines', fmtNum(rows.length)], ['Value', fmtMoney(sum('value'))]]
  }
}

// mode "reports": every report type. mode "field": the Field records page (projects only).
export default function ReportBuilder({ mode = 'reports', categories = [], owners = [], projects = [], recipients = [], takers = [], settings }) {
  const fieldMode = mode === 'field'
  const presets = datePresets()
  const [scope, setScope] = useState(fieldMode ? 'field' : 'store')
  const [storeId, setStoreId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [location, setLocation] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [takenBy, setTakenBy] = useState('')
  const [ledgerType, setLedgerType] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [from, setFrom] = useState(presets[0].from)
  const [to, setTo] = useState(presets[0].to)
  const [refNo, setRefNo] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allStores = categories.flatMap(c => c.stores.map(s => ({ ...s, categoryName: c.name })))
  const ownerName = ownerId === NO_OWNER ? 'No owner' : owners.find(o => o.id === ownerId)?.name
  const needsDates = !['ref', 'lowstock'].includes(scope)

  function chooseScope(next) {
    setScope(next)
    setReport(null)
    setError('')
  }

  async function load(params) {
    setLoading(true); setError(''); setReport(null)
    try {
      const data = await api(`/api/reports?${params}`)
      setReport({ ...data, ownerName: data.scope === 'ref' ? null : ownerName })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function generate(e) {
    e?.preventDefault()
    const params = new URLSearchParams({ scope })
    if (scope === 'ref') {
      if (!refNo.trim()) { setError('Enter a ref no.'); return }
      params.set('refNo', refNo.trim())
      load(params)
      return
    }
    if (needsDates) {
      if (!from || !to) { setError('Choose both dates.'); return }
      params.set('from', from)
      params.set('to', to)
    }
    if (scope === 'store') {
      if (!storeId) { setError('Choose a store.'); return }
      params.set('storeId', storeId)
    }
    if (scope === 'category') {
      if (!categoryId) { setError('Choose a category.'); return }
      params.set('categoryId', categoryId)
    }
    if (scope === 'ledger' || scope === 'lowstock') {
      const [kind, id] = location.split(':')
      if (kind === 'store') params.set('storeId', id)
      if (kind === 'cat') params.set('categoryId', id)
      if (scope === 'ledger' && ledgerType) params.set('type', ledgerType)
    }
    if (scope === 'external' && recipientId) params.set('recipientId', recipientId)
    if (scope === 'field') {
      if (projectId) params.set('projectId', projectId)
      if (takenBy.trim()) params.set('takenBy', takenBy.trim())
    }
    if (ownerId) params.set('ownerId', ownerId)
    load(params)
  }

  function pickRef(value) {
    setRefNo(value)
    load(new URLSearchParams({ scope: 'ref', refNo: value }))
  }

  const cols = report ? columnsFor(report.scope) : []
  const sections = report ? withTotals([{ cols, rows: report.rows, empty: EMPTY_TEXT[report.scope] }]) : []
  const subtitle = report ? [
    report.from && `${fmtDate(report.from)} – ${fmtDate(report.to)}`,
    report.scope === 'lowstock' && `As at ${fmtDate(new Date())}`,
    report.typeLabel && report.typeLabel !== 'All movements' && report.typeLabel,
    report.takenBy && `Taken by: ${report.takenBy}`,
    report.ownerName && `Owner: ${report.ownerName}`,
  ].filter(Boolean).join(' · ') : ''
  const fileBase = report
    ? report.scope === 'ref'
      ? `ref-${fileSafe(report.refNo)}`
      : `${report.scope === 'field' ? 'field-records' : `${report.scope}-report`}${report.from ? `-${report.from}-to-${report.to}` : ''}`
    : ''
  const exportArgs = report && { title: documentTitle(report), subtitle, settings, fileBase, sections }

  const ownerField = (
    <Field label="Stock owner">
      <select className={ui.input} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
        <option value="">All owners</option>
        <option value={NO_OWNER}>No owner</option>
        {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </Field>
  )

  const dateFields = (
    <>
      <Field label="From" required>
        <input type="date" className={ui.input} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
      </Field>
      <Field label="To" required>
        <input type="date" className={ui.input} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
      </Field>
    </>
  )

  return (
    <>
      <PageHeader
        title={fieldMode ? 'Field records' : 'Reports'}
        subtitle={fieldMode
          ? 'Stock used on projects, who took it and what it was worth'
          : 'Balances, movements and issues for any period, ready to print, save as PDF or export to Excel'}
      />

      <div className={ui.page}>
        <form className={ui.card} onSubmit={generate} data-no-print>
          <div className={ui.cardHeader}>
            <div>
              <h2 className={ui.cardTitle}><IconReportAnalytics size={17} /> {fieldMode ? 'Filters' : 'Build a report'}</h2>
              <p className={ui.cardSubtitle}>
                {fieldMode ? 'Narrow the records by project, person, owner and period.' : 'Choose a report, set its filters and generate it.'}
              </p>
            </div>
          </div>
          <div className={`${ui.cardBody} ${ui.stackLg}`}>
            {!fieldMode && (
              <div className={ui.picker} role="radiogroup" aria-label="Report type">
                {REPORT_TYPES.map(({ id, title, text, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={scope === id}
                    className={`${ui.pickerItem} ${scope === id ? ui.pickerActive : ''}`}
                    onClick={() => chooseScope(id)}
                  >
                    <span className={ui.pickerIcon}><Icon size={18} /></span>
                    <span>
                      <span className={ui.pickerTitle}>{title}</span>
                      <span className={ui.pickerText}>{text}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {scope === 'ref' ? (
              <div className={ui.formRow2}>
                <Field label="Ref no." hint="Pick a suggestion or type the exact ref no. and generate" asLabel={false}>
                  <RefSearch value={refNo} onChange={setRefNo} onPick={pickRef} />
                </Field>
              </div>
            ) : (
              <div className={ui.stack}>
                <div className={ui.formGrid}>
                  {scope === 'store' && (
                    <Field label="Store" required>
                      <select className={ui.input} value={storeId} onChange={e => setStoreId(e.target.value)}>
                        <option value="">Choose a store…</option>
                        {allStores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.categoryName})</option>)}
                      </select>
                    </Field>
                  )}
                  {scope === 'category' && (
                    <Field label="Category" required>
                      <select className={ui.input} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                        <option value="">Choose a category…</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                  )}
                  {(scope === 'ledger' || scope === 'lowstock') && (
                    <Field label="Stores">
                      <select className={ui.input} value={location} onChange={e => setLocation(e.target.value)}>
                        <option value="">All stores</option>
                        {categories.map(c => (
                          <optgroup key={c.id} label={c.name}>
                            <option value={`cat:${c.id}`}>All of {c.name}</option>
                            {c.stores.map(s => <option key={s.id} value={`store:${s.id}`}>{s.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </Field>
                  )}
                  {scope === 'ledger' && (
                    <Field label="Movements">
                      <select className={ui.input} value={ledgerType} onChange={e => setLedgerType(e.target.value)}>
                        {LEDGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                  )}
                  {scope === 'external' && (
                    <Field label="Recipient">
                      <select className={ui.input} value={recipientId} onChange={e => setRecipientId(e.target.value)}>
                        <option value="">All recipients</option>
                        {recipients.map(r => <option key={r.id} value={r.id}>{r.name}{r.company ? ` (${r.company})` : ''}</option>)}
                      </select>
                    </Field>
                  )}
                  {scope === 'field' && (
                    <>
                      <Field label="Project">
                        <select className={ui.input} value={projectId} onChange={e => setProjectId(e.target.value)}>
                          <option value="">All projects</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.location ? ` (${p.location})` : ''}</option>)}
                        </select>
                      </Field>
                      <Field label="Taken by" hint="Anyone, or part of a name">
                        <input className={ui.input} list="taken-by-names" value={takenBy} onChange={e => setTakenBy(e.target.value)} placeholder="Anyone" />
                        <datalist id="taken-by-names">
                          {takers.map(name => <option key={name} value={name} />)}
                        </datalist>
                      </Field>
                    </>
                  )}
                  {ownerField}
                  {needsDates && dateFields}
                </div>
                {needsDates && (
                  <div className={ui.presets}>
                    {presets.map(p => (
                      <button key={p.label} type="button" className={ui.preset} onClick={() => { setFrom(p.from); setTo(p.to) }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className={`${ui.alert} ${ui.alertDanger}`}>
                <IconAlertCircle size={17} />
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className={ui.cardFooter}>
            <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={loading}>
              {loading ? <><span className={ui.spinner} /> Generating…</> : <><IconReportAnalytics size={17} /> Generate report</>}
            </button>
          </div>
        </form>

        {report && (
          <>
            <ExportBar
              info={<>
                <strong className={ui.strong}>{plural(report.rows.length, 'row')}</strong>
                {report.scope === 'ref' && report.rows.length > 0 && (
                  <Link href={`/notes?ref=${encodeURIComponent(report.refNo)}`} className={`${ui.btn} ${ui.btnGhost} ${ui.btnSm}`}>
                    <IconFileText size={15} /> Printable note
                  </Link>
                )}
              </>}
              onPdf={() => exportPdf(exportArgs)}
              onExcel={() => exportExcel(exportArgs)}
            />
            <ReportDocument
              title={documentTitle(report)}
              subtitle={subtitle}
              settings={settings}
              sections={sections}
              chips={(
                <div className={ui.chips}>
                  {summaryChips(report).map(([label, value]) => <span key={label} className={ui.chip}>{label} <strong>{value}</strong></span>)}
                </div>
              )}
            />
          </>
        )}

        {!report && !loading && (
          <section className={ui.card} data-no-print>
            <EmptyState icon={IconReportAnalytics} title="No report yet">
              {fieldMode ? 'Set the filters above and generate the field records.' : 'Choose a report type and its filters, then generate it. You can print it, save it as a PDF or export it to Excel.'}
            </EmptyState>
          </section>
        )}
      </div>
    </>
  )
}
