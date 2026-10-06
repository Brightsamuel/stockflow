'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconAlertTriangle, IconArrowBarToDown, IconArrowBarUp, IconArrowsExchange, IconBox, IconCoins, IconEdit,
  IconArrowBackUp, IconHistory, IconLockOpen2, IconPackage, IconRestore, IconSearch, IconStack2, IconTrash,
} from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Tabs from '@/components/ui/Tabs'
import Badge, { MovementBadge } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ExportBar from '@/components/ui/ExportBar'
import ReportDocument from '@/components/ui/ReportDocument'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { canEdit, isAdminRole } from '@/lib/constants'
import { fmtDate, fmtMoney, fmtNum, fmtSigned, plural, timeAgo } from '@/lib/format'
import { withTotals } from '@/lib/tables'
import { exportExcel, exportPdf, fileSafe } from '@/lib/exporters'
import StockInModal from './StockInModal'
import StockMoveModal, { TRANSFER_DESTINATIONS, STOCK_OUT_DESTINATIONS } from './StockMoveModal'
import EditItemModal from './EditItemModal'
import ReturnModal from './ReturnModal'
import ReleaseModal from './ReleaseModal'
import ui from '@/styles/ui.module.css'

// Lines recorded on a received, issue, transfer or return note (the rest are adjustments)
const NOTE_TYPES = ['IN', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN']

// The inventory as a stock sheet for print, PDF and Excel (the same columns as on screen)
const stockSheetCols = items => [
  { label: 'Item', value: i => i.name, strong: true },
  ...(items.some(i => i.keptFor) ? [{ label: 'Kept for', value: i => i.keptFor }] : []),
  { label: 'Owner', value: i => i.owner },
  { label: 'Unit', value: i => i.unit, muted: true },
  { label: 'Rate (UGX)', value: i => i.rate, num: true },
  { label: 'Last added', value: i => i.lastAdded, num: true },
  { label: 'Deducted', value: i => i.deducted, num: true },
  { label: 'Balance', value: i => i.quantity, num: true },
  { label: 'Value (UGX)', value: i => i.value, num: true, total: true },
  { label: 'Status', value: i => (i.isLow ? 'Low' : 'In stock') },
]

export default function StoreDashboard({ store, items, deletedItems = [], movements, movementTotal, allStores, currentUser, settings }) {
  const router = useRouter()
  const { confirm, toast } = useConfirm()
  const [tab, setTab] = useState('inventory')
  const [modal, setModal] = useState(null)
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN'
  const canWork = canEdit(currentUser.role) // Viewers see everything but record nothing
  const canRelease = isAdminRole(currentUser.role)
  const lowCount = items.filter(i => i.isLow).length
  const totalQty = items.reduce((s, i) => s + i.quantity, 0)
  const totalValue = items.reduce((s, i) => s + i.value, 0)

  const q = query.trim().toLowerCase()
  const visibleItems = items.filter(i =>
    (!lowOnly || i.isLow) && (!q || [i.name, i.owner, i.keptFor ?? ''].some(text => text.toLowerCase().includes(q))))

  // Print / PDF / Excel of the inventory follow the search box and "Low stock only"
  const stockSheet = {
    title: `Stock sheet · ${store.name}`,
    subtitle: [
      store.category.name,
      `As at ${fmtDate(new Date())}`,
      lowOnly && 'Low stock only',
      q && `Matching "${query.trim()}"`,
    ].filter(Boolean).join(' · '),
    meta: [
      ['Items', fmtNum(visibleItems.length)],
      ['Stock value', fmtMoney(visibleItems.reduce((s, i) => s + i.value, 0))],
    ],
    sections: withTotals([{ cols: stockSheetCols(items), rows: visibleItems, empty: 'No items match the filters.' }]),
  }
  const sheetExport = { ...stockSheet, settings, fileBase: `stock-sheet-${fileSafe(store.name)}` }

  function done() {
    setModal(null)
    router.refresh()
  }

  async function act(id, action, successMessage) {
    setBusyId(id)
    try {
      await action()
      toast(successMessage)
      router.refresh()
    } catch (e) {
      toast(e.message, { type: 'error' })
    } finally {
      setBusyId(null)
    }
  }

  async function removeItem(item) {
    const ok = await confirm({
      title: 'Remove item',
      message: `Remove ${item.name}${item.owner !== '—' ? ` (${item.owner})` : ''} from ${store.name}?\n\nIts ${fmtNum(item.quantity)} ${item.unit} leave the store's balance and the removal is recorded in the history. It can be restored later from Removed items.\n\nThis doesn't change the note the stock came in on. If that note was entered wrongly, delete the note in Documents instead.`,
      confirmLabel: 'Remove item',
      danger: true,
    })
    if (ok) act(item.id, () => api(`/api/items/${item.id}`, { method: 'DELETE' }), `${item.name} removed from ${store.name}`)
  }

  function restoreItem(entry) {
    act(entry.id, () => api(`/api/items/${entry.id}/restore`, { method: 'POST' }), `${entry.name} restored to ${store.name}`)
  }

  async function deletePermanently(entry) {
    const ok = await confirm({
      title: 'Delete for good',
      message: `Delete the removed ${entry.name} row for good?\n\nIts movement history is kept, but the row can no longer be restored.`,
      confirmLabel: 'Delete for good',
      danger: true,
    })
    if (ok) act(entry.id, () => api(`/api/items/${entry.id}/permanent`, { method: 'DELETE' }), `${entry.name} deleted for good`)
  }

  const tabs = [
    { id: 'inventory', label: 'Inventory', icon: IconBox, count: items.length },
    { id: 'movements', label: 'Movement log', icon: IconHistory, count: movementTotal },
    ...(isSuperAdmin ? [{ id: 'removed', label: 'Removed items', icon: IconTrash, count: deletedItems.length }] : []),
  ]

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Stores' }, { label: store.category.name }]}
        title={store.name}
        badge={store.category.trackLogs
          ? <Badge tone="success" dot title="Changes record who made them">Tracking on</Badge>
          : <Badge tone="neutral" dot title="Changes don't record who made them">Tracking off</Badge>}
        subtitle={`${plural(items.length, 'item')} in stock · ${fmtMoney(totalValue)}`}
        actions={canWork ? (
          <>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setModal('in')}>
              <IconArrowBarToDown size={17} /> Stock in
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setModal('transfer')} title="Move stock to another store">
              <IconArrowsExchange size={17} /> Transfer
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setModal('return')} title="Stock coming back from a project site">
              <IconArrowBackUp size={17} /> Return
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setModal('out')} title="Issue stock for use: a project (field) or an external party">
              <IconArrowBarUp size={17} /> Stock out
            </button>
          </>
        ) : null}
      />

      <div className={ui.page}>
        <div className={`${ui.grid} ${ui.cols4}`} data-no-print>
          <StatCard icon={IconPackage} tone="info" label="Items" value={fmtNum(items.length)} hint="Products × owners in stock" />
          <StatCard icon={IconStack2} tone="teal" label="Total quantity" value={fmtNum(totalQty)} hint="All units combined" />
          <StatCard icon={IconCoins} tone="brand" label="Stock value" value={fmtMoney(totalValue)} hint="At current rates" />
          <StatCard
            icon={IconAlertTriangle}
            tone={lowCount ? 'warning' : 'success'}
            warn={lowCount > 0}
            label="Low stock"
            value={fmtNum(lowCount)}
            hint={lowCount ? 'At or below their alert level' : 'Everything is above its alert level'}
          />
        </div>

        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'inventory' && items.length > 0 && (
          <>
            <ExportBar
              info={<strong className={ui.strong}>{visibleItems.length === items.length ? plural(items.length, 'item') : `${visibleItems.length} of ${items.length} items`}</strong>}
              onPdf={() => exportPdf(sheetExport)}
              onExcel={() => exportExcel(sheetExport)}
            />
            <div className={ui.printOnly}>
              <ReportDocument {...stockSheet} settings={settings} />
            </div>
          </>
        )}

        {tab === 'inventory' && (
          <section className={`${ui.card} ${ui.cardFlush}`} data-no-print>
            {items.length === 0 ? (
              <EmptyState
                icon={IconBox}
                title="No stock in this store yet"
                action={canWork ? <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setModal('in')}><IconArrowBarToDown size={17} /> Stock in</button> : null}
              >
                Use Stock in to receive the first items into {store.name}.
              </EmptyState>
            ) : (
              <>
                <div className={ui.toolbar}>
                  <div className={`${ui.inputWrap} ${ui.toolbarSearch}`}>
                    <span className={ui.inputIcon}><IconSearch size={16} /></span>
                    <input
                      className={`${ui.input} ${ui.inputSm} ${ui.inputWithIcon}`}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search item or owner…"
                      aria-label="Search the inventory"
                    />
                  </div>
                  <button type="button" className={`${ui.toggle} ${lowOnly ? ui.toggleOn : ''}`} onClick={() => setLowOnly(v => !v)} aria-pressed={lowOnly}>
                    <IconAlertTriangle size={14} /> Low stock only{lowCount ? ` (${lowCount})` : ''}
                  </button>
                  <span className={ui.spacer} />
                  <span className={ui.hint}>{visibleItems.length === items.length ? plural(items.length, 'item') : `${visibleItems.length} of ${items.length} items`}</span>
                </div>
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Owner</th>
                        <th>Unit</th>
                        <th className={ui.num}>Rate (UGX)</th>
                        <th className={ui.num}>Last added</th>
                        <th className={ui.num}>Deducted</th>
                        <th className={ui.num}>Balance</th>
                        <th className={ui.num}>Value (UGX)</th>
                        <th>Status</th>
                        <th>Updated</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map(item => (
                        <tr key={item.id}>
                          <td>
                            <Link href={`/search?product=${item.productId}`} className={ui.cellLink} title="View this product's history">{item.name}</Link>
                            {item.keptFor && <span className={ui.cellSub}><Badge tone="info" title="Received for this project; it can only be issued to it">For {item.keptFor}</Badge></span>}
                          </td>
                          <td className={item.owner === '—' ? ui.cellMuted : undefined}>{item.owner}</td>
                          <td className={ui.cellMuted}>{item.unit}</td>
                          <td className={ui.num}>{fmtNum(item.rate)}</td>
                          <td className={ui.num}>{fmtNum(item.lastAdded)}</td>
                          <td className={ui.num}>{fmtNum(item.deducted)}</td>
                          <td className={`${ui.num} ${ui.strong}`}>{fmtNum(item.quantity)}</td>
                          <td className={ui.num}>{fmtNum(item.value)}</td>
                          <td>
                            {item.isLow
                              ? <Badge tone="warning" dot>Low</Badge>
                              : <Badge tone="success" dot>In stock</Badge>}
                          </td>
                          <td className={`${ui.cellMuted} ${ui.nowrap}`} suppressHydrationWarning>{timeAgo(item.updatedAt)}</td>
                          <td>
                            <div className={ui.cellActions}>
                              {canWork && (
                                <button type="button" className={ui.iconBtn} title="Edit rate, quantity or alert" onClick={() => setModal({ edit: item })}>
                                  <IconEdit size={17} />
                                </button>
                              )}
                              {canRelease && item.keptFor && item.quantity > 0 && (
                                <button type="button" className={ui.iconBtn} title={`Release what is left for ${item.keptFor} to general stock`} onClick={() => setModal({ release: item })}>
                                  <IconLockOpen2 size={17} />
                                </button>
                              )}
                              {isSuperAdmin && (
                                <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Remove from store" onClick={() => removeItem(item)} disabled={busyId === item.id}>
                                  <IconTrash size={17} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {visibleItems.length === 0 && (
                        <tr><td colSpan={11} className={ui.tableEmpty}>No items match the filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'movements' && (
          <section className={`${ui.card} ${ui.cardFlush}`}>
            {movements.length === 0 ? (
              <EmptyState icon={IconHistory} title="No movements yet">
                Stock received, transferred, issued or adjusted in {store.name} will be listed here.
              </EmptyState>
            ) : (
              <>
                <div className={ui.tableWrap}>
                  <table className={ui.table}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Item</th>
                        <th>Owner</th>
                        <th className={ui.num}>Qty</th>
                        <th>Details</th>
                        <th>Ref no.</th>
                        <th>Taken by</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={m.id}>
                          <td className={ui.nowrap}>{fmtDate(m.date)}</td>
                          <td><MovementBadge kind={m.kind} /></td>
                          <td>
                            <Link href={`/search?product=${m.productId}`} className={ui.cellLink}>{m.product}</Link>
                            <span className={ui.cellSub}>{m.unit}{m.keptFor ? ` · kept for ${m.keptFor}` : ''}</span>
                          </td>
                          <td className={m.owner === '—' ? ui.cellMuted : undefined}>{m.owner}</td>
                          <td className={`${ui.num} ${ui.strong}`}>{m.change ? fmtSigned(m.change) : '—'}</td>
                          <td className={ui.cellMuted}>{m.note || '—'}</td>
                          <td>
                            {m.refNo
                              ? <Link href={`/notes?ref=${encodeURIComponent(m.refNo)}`} className={`${ui.link} ${ui.mono}`} title="Open the printable note">{m.refNo}</Link>
                              : NOTE_TYPES.includes(m.type)
                                ? <Link href={`/notes?log=${m.id}`} className={ui.link} title="Saved without a ref no.: open its note">Note</Link>
                                : <span className={ui.cellMuted}>—</span>}
                          </td>
                          <td className={m.takenBy ? undefined : ui.cellMuted}>{m.takenBy || '—'}</td>
                          <td className={ui.cellMuted}>{m.by || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {movementTotal > movements.length && (
                  <div className={ui.cardFooter}>
                    <span className={ui.hint}>
                      Showing the latest {fmtNum(movements.length)} of {fmtNum(movementTotal)} movements. For any period, use the{' '}
                      <Link href="/reports" className={ui.link}>Movement ledger report</Link>.
                    </span>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === 'removed' && isSuperAdmin && (
          <section className={`${ui.card} ${ui.cardFlush}`}>
            {deletedItems.length === 0 ? (
              <EmptyState icon={IconTrash} title="Nothing removed">Items removed from {store.name} can be restored from here.</EmptyState>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Owner</th>
                      <th className={ui.num}>Qty when removed</th>
                      <th>Removed</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {deletedItems.map(entry => (
                      <tr key={entry.id}>
                        <td className={ui.cellStrong}>{entry.name}<span className={ui.cellSub}>{entry.unit}{entry.keptFor ? ` · kept for ${entry.keptFor}` : ''}</span></td>
                        <td className={entry.owner === '—' ? ui.cellMuted : undefined}>{entry.owner}</td>
                        <td className={ui.num}>{fmtNum(entry.quantity)}</td>
                        <td className={ui.cellMuted} suppressHydrationWarning>{timeAgo(entry.deletedAt)}</td>
                        <td>
                          <div className={ui.cellActions}>
                            <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => restoreItem(entry)} disabled={busyId === entry.id}>
                              <IconRestore size={15} /> Restore
                            </button>
                            <button type="button" className={`${ui.btn} ${ui.btnDangerGhost} ${ui.btnSm}`} onClick={() => deletePermanently(entry)} disabled={busyId === entry.id}>
                              Delete for good
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {modal === 'in' && <StockInModal store={store} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'transfer' && (
        <StockMoveModal
          title="Transfer to another store"
          destinations={TRANSFER_DESTINATIONS}
          store={{ ...store, items }}
          allStores={allStores}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
      {modal === 'out' && (
        <StockMoveModal
          title="Stock out"
          destinations={STOCK_OUT_DESTINATIONS}
          store={{ ...store, items }}
          allStores={allStores}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
      {modal?.edit && <EditItemModal item={modal.edit} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'return' && <ReturnModal store={{ ...store, items }} onClose={() => setModal(null)} onDone={done} />}
      {modal?.release && <ReleaseModal item={modal.release} onClose={() => setModal(null)} onDone={done} />}
    </>
  )
}
