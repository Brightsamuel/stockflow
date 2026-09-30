'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertTriangle, IconArrowRight, IconEye, IconFileText, IconRestore, IconSearch, IconTrash } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Field from '@/components/ui/Field'
import Tabs from '@/components/ui/Tabs'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import ExportBar from '@/components/ui/ExportBar'
import ReportDocument from '@/components/ui/ReportDocument'
import EmptyState from '@/components/ui/EmptyState'
import RefSearch from '@/components/RefSearch'
import DeleteNoteModal from '@/components/DeleteNoteModal'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { fmtDate, fmtDateTime, fmtNum, plural } from '@/lib/format'
import { withTotals } from '@/lib/tables'
import { exportPdfDocuments, fileSafe } from '@/lib/exporters'
import ui from '@/styles/ui.module.css'

const LINE_COLS = [
  { label: '#', value: r => r.no, muted: true },
  { label: 'Product', value: r => r.product, strong: true },
  { label: 'Owner', value: r => r.owner },
  { label: 'Unit', value: r => r.unit, muted: true },
  { label: 'Qty', value: r => r.quantity, num: true },
  { label: 'Rate (UGX)', value: r => r.rate, num: true },
  { label: 'Amount (UGX)', value: r => r.amount, num: true, total: true },
]

// The printable documents recorded under one ref no.: received, issue and transfer notes
function toDocument(note) {
  return {
    title: note.title,
    subtitle: note.subtitle,
    meta: note.meta,
    sections: withTotals([{ cols: LINE_COLS, rows: note.lines.map((line, i) => ({ ...line, no: i + 1 })) }]),
    signatures: note.signatures,
  }
}

function noteName(note) {
  return note.refNo ? `${note.title} ${note.refNo}` : note.title
}

// refNo or logId: which notes are open (logId: a stock in or stock out saved without a ref no.).
// canDelete: Super admins can delete a note and restore deleted ones (the Deleted tab).
export default function NotesView({ refNo, logId, notes, settings, canDelete = false, deletions = [], initialTab = 'notes' }) {
  const router = useRouter()
  const { confirm, toast } = useConfirm()
  const [query, setQuery] = useState(refNo)
  const [tab, setTab] = useState(initialTab)
  const [deleting, setDeleting] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const documents = notes.map(toDocument)
  const deletedCount = deletions.filter(d => !d.restoredAt).length
  const opened = Boolean(refNo || logId)

  function open(value) {
    const ref = value.trim()
    if (ref) router.push(`/notes?ref=${encodeURIComponent(ref)}`)
  }

  function chooseTab(next) {
    setTab(next)
    const params = new URLSearchParams(window.location.search)
    if (next === 'deleted') params.set('tab', 'deleted')
    else params.delete('tab')
    const search = params.toString()
    window.history.replaceState(null, '', `/notes${search ? `?${search}` : ''}`)
  }

  function onDeleted(note) {
    setDeleting(null)
    toast(`${noteName(note)} deleted. Its stock has been put back.`, { action: { label: 'See deleted notes', href: '/notes?tab=deleted' } })
    router.refresh()
  }

  async function restore(deletion) {
    const ok = await confirm({
      title: 'Restore note',
      message: `Restore ${noteName(deletion)}?\n\nIts ${plural(deletion.itemCount, 'line')} count again in stock, reports and product history, and the stock moves again as it did when it was recorded. Every store involved must still have enough stock.`,
      confirmLabel: 'Restore note',
    })
    if (!ok) return
    setBusyId(deletion.id)
    try {
      await api(`/api/deletions/${deletion.id}/restore`, { method: 'POST', body: {} })
      toast(`${noteName(deletion)} restored`, deletion.refNo ? { action: { label: 'Open the note', href: `/notes?ref=${encodeURIComponent(deletion.refNo)}` } } : undefined)
      router.refresh()
    } catch (e) {
      toast(e.message, { type: 'error', duration: 12000 })
    } finally {
      setBusyId(null)
    }
  }

  const tabs = [
    { id: 'notes', label: 'Documents', icon: IconFileText },
    { id: 'deleted', label: 'Deleted', icon: IconTrash, count: deletedCount },
  ]

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Printable received, issue and transfer notes with signature lines, by ref no."
      />
      <div className={ui.page}>
        {canDelete && <Tabs tabs={tabs} active={tab} onChange={chooseTab} />}

        {tab === 'notes' && (
          <>
            <form className={ui.card} onSubmit={e => { e.preventDefault(); open(query) }} data-no-print>
              <div className={ui.cardBody}>
                <div className={`${ui.row} ${ui.rowEnd}`}>
                  <Field label="Ref no." asLabel={false} className={ui.toolbarSearch}>
                    <RefSearch value={query} onChange={setQuery} onPick={open} autoFocus={!opened} />
                  </Field>
                  <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
                    <IconSearch size={16} /> Open
                  </button>
                </div>
              </div>
            </form>

            {!opened && (
              <section className={ui.card} data-no-print>
                <EmptyState icon={IconFileText} title="Find a ref no.">
                  Every stock in, transfer and stock out has a printable note: a Goods Received Note, a Material Issue
                  Note, a Goods Issue Note or a Stock Transfer Note, with lines to sign. Search by ref no., or open one
                  from a store&apos;s movement log.
                </EmptyState>
              </section>
            )}

            {opened && documents.length === 0 && (
              <section className={ui.card}>
                <EmptyState icon={IconFileText} title={refNo ? `Nothing recorded under ${refNo}` : 'This note is no longer available'}>
                  {canDelete
                    ? 'Check the ref no. or pick one from the suggestions. If the note was deleted, it is listed under Deleted.'
                    : 'Check the ref no. or pick one from the suggestions.'}
                </EmptyState>
              </section>
            )}

            {documents.length > 0 && (
              <>
                <ExportBar
                  info={(
                    <>
                      <strong className={ui.strong}>{plural(documents.length, 'document')}</strong>
                      {refNo ? ` for ${refNo}` : ' saved without a ref no.'}
                      {documents.length > 1 && <> · each prints on its own page <IconArrowRight size={14} /></>}
                    </>
                  )}
                  onPdf={() => exportPdfDocuments({ documents, settings, fileBase: `note-${fileSafe(refNo || notes[0].title)}` })}
                />
                {documents.map((doc, i) => (
                  <ReportDocument
                    key={notes[i].id}
                    {...doc}
                    settings={settings}
                    printPage={documents.length > 1}
                    actions={canDelete && notes[i].deletable ? (
                      <>
                        <span>Recorded by mistake? Deleting the note takes its lines out and puts the stock back.</span>
                        <button type="button" className={`${ui.btn} ${ui.btnDangerGhost} ${ui.btnSm}`} onClick={() => setDeleting(notes[i])}>
                          <IconTrash size={15} /> Delete note
                        </button>
                      </>
                    ) : null}
                  />
                ))}
              </>
            )}
          </>
        )}

        {tab === 'deleted' && canDelete && (
          <section className={`${ui.card} ${ui.cardFlush}`}>
            <div className={ui.cardHeader}>
              <div>
                <h2 className={ui.cardTitle}><IconTrash size={17} /> Deleted notes</h2>
                <p className={ui.cardSubtitle}>
                  Kept for the record and left out of stock, reports and product history. Restoring one counts it again.
                </p>
              </div>
            </div>
            {deletions.length === 0 ? (
              <EmptyState icon={IconTrash} title="Nothing deleted">Notes deleted from here are kept and listed, with who deleted them and why.</EmptyState>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>Deleted</th>
                      <th>Note</th>
                      <th>Details</th>
                      <th className={ui.num}>Lines</th>
                      <th className={ui.num}>Value (UGX)</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {deletions.map(d => (
                      <tr key={d.id}>
                        <td className={ui.nowrap}>
                          {fmtDateTime(d.deletedAt)}
                          {d.deletedBy && <span className={ui.cellSub}>by {d.deletedBy}</span>}
                        </td>
                        <td>
                          <span className={ui.cellStrong}>{d.title}</span>
                          <span className={`${ui.cellSub} ${d.refNo ? ui.mono : ''}`}>{d.refNo ?? 'No ref no.'}</span>
                        </td>
                        <td>
                          {d.summary}
                          <span className={ui.cellSub}>Dated {fmtDate(d.entryDate)}</span>
                        </td>
                        <td className={ui.num}>{fmtNum(d.itemCount)}</td>
                        <td className={ui.num}>{fmtNum(d.value)}</td>
                        <td className={ui.cellMuted}>{d.reason}</td>
                        <td>
                          {d.restoredAt ? (
                            <>
                              <Badge tone="teal" dot>Restored</Badge>
                              <span className={ui.cellSub}>{fmtDate(d.restoredAt)}{d.restoredBy ? ` by ${d.restoredBy}` : ''}</span>
                            </>
                          ) : <Badge tone="danger" dot>Deleted</Badge>}
                        </td>
                        <td>
                          <div className={ui.cellActions}>
                            <button type="button" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSm}`} onClick={() => setViewing(d)}>
                              <IconEye size={15} /> View
                            </button>
                            {!d.restoredAt && (
                              <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => restore(d)} disabled={busyId === d.id}>
                                {busyId === d.id ? <span className={ui.spinner} /> : <IconRestore size={15} />} Restore
                              </button>
                            )}
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

      {deleting && (
        <DeleteNoteModal note={deleting} refNo={refNo} logId={logId} onClose={() => setDeleting(null)} onDeleted={onDeleted} />
      )}

      {viewing && (
        <Modal
          title={noteName(viewing)}
          subtitle={`Deleted ${fmtDateTime(viewing.deletedAt)}${viewing.deletedBy ? ` by ${viewing.deletedBy}` : ''}`}
          size="xl"
          onClose={() => setViewing(null)}
          closeOnBackdrop
          footer={<button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => setViewing(null)}>Close</button>}
        >
          <div className={`${ui.alert} ${viewing.restoredAt ? ui.alertInfo : ui.alertWarning}`}>
            <IconAlertTriangle size={17} />
            <span>
              <strong>Reason:</strong> {viewing.reason}
              {viewing.restoredAt && <> · Restored {fmtDate(viewing.restoredAt)}{viewing.restoredBy ? ` by ${viewing.restoredBy}` : ''}</>}
            </span>
          </div>
          <ReportDocument {...toDocument(viewing.document)} settings={settings} />
        </Modal>
      )}
    </>
  )
}
