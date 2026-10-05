'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconHistory, IconInfoCircle, IconMessageQuestion, IconRosetteDiscountCheck } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Tabs from '@/components/ui/Tabs'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ReportDocument from '@/components/ui/ReportDocument'
import ApprovalActions, { ApprovalBadge } from '@/components/ApprovalActions'
import { useConfirm } from '@/components/ConfirmProvider'
import { fmtDateTime, fmtMoney, fmtNum, plural } from '@/lib/format'
import { withTotals } from '@/lib/tables'
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

function noteLink(note) {
  return note.scope.refNo ? `/notes?ref=${encodeURIComponent(note.scope.refNo)}` : `/notes?log=${note.scope.logId}`
}

// notes: issue notes not yet approved (lib/approvals listPendingNotes); recent: latest decisions
export default function ApprovalsView({ notes, recent, settings, currentUser, initialTab = 'awaiting' }) {
  const router = useRouter()
  const { toast } = useConfirm()
  const [tab, setTab] = useState(initialTab)
  const awaiting = notes.filter(n => n.approval.status === 'AWAITING')
  const queried = notes.filter(n => n.approval.status === 'QUERIED')
  const shown = tab === 'queried' ? queried : awaiting

  function chooseTab(next) {
    setTab(next)
    window.history.replaceState(null, '', next === 'awaiting' ? '/approvals' : `/approvals?tab=${next}`)
  }

  function done(message) {
    toast(message)
    router.refresh()
  }

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Stock outs signed off by an approver after the stock has left. The approver's name then fills Approved by on the issue note."
      />
      <div className={ui.page}>
        {!currentUser.canApprove && (
          <div className={`${ui.alert} ${ui.alertInfo}`}>
            <IconInfoCircle size={17} />
            <span>You can follow approvals here, but only approvers can approve. An admin can give the Approver permission under Users.</span>
          </div>
        )}

        <Tabs
          tabs={[
            { id: 'awaiting', label: 'Awaiting approval', icon: IconRosetteDiscountCheck, count: awaiting.length },
            { id: 'queried', label: 'Queried', icon: IconMessageQuestion, count: queried.length },
            { id: 'recent', label: 'Recent decisions', icon: IconHistory },
          ]}
          active={tab}
          onChange={chooseTab}
        />

        {tab !== 'recent' && shown.length === 0 && (
          <section className={ui.card}>
            <EmptyState icon={tab === 'queried' ? IconMessageQuestion : IconRosetteDiscountCheck} title={tab === 'queried' ? 'Nothing queried' : 'Nothing to approve'}>
              {tab === 'queried'
                ? 'Stock outs an approver has questioned are listed here until they are approved.'
                : 'Stock outs to projects and external parties appear here as soon as they are saved.'}
            </EmptyState>
          </section>
        )}

        {tab !== 'recent' && shown.map(note => (
          <ReportDocument
            key={`${note.scope.refNo ?? note.scope.logId}|${note.id}`}
            title={note.title}
            subtitle={note.subtitle}
            meta={note.meta}
            settings={settings}
            sections={withTotals([{ cols: LINE_COLS, rows: note.lines.map((line, i) => ({ ...line, no: i + 1 })) }])}
            actions={(
              <>
                <span className={ui.row}>
                  <ApprovalBadge approval={note.approval} />
                  <span>{plural(note.lines.length, 'line')} · {fmtMoney(note.total)}</span>
                  <Link href={noteLink(note)} className={ui.link}>Open the note</Link>
                </span>
                <span className={ui.row}>
                  <ApprovalActions note={note} scope={note.scope} currentUser={currentUser} onDone={done} />
                </span>
              </>
            )}
          />
        ))}

        {tab === 'recent' && (
          <section className={`${ui.card} ${ui.cardFlush}`}>
            {recent.length === 0 ? (
              <EmptyState icon={IconHistory} title="No decisions yet">Approvals and queries are listed here, newest first.</EmptyState>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Decision</th>
                      <th>Note</th>
                      <th>Details</th>
                      <th className={ui.num}>Lines</th>
                      <th>By</th>
                      <th>Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(d => (
                      <tr key={d.id}>
                        <td className={ui.nowrap}>{fmtDateTime(d.at)}</td>
                        <td>{d.status === 'APPROVED' ? <Badge tone="teal" dot>Approved</Badge> : <Badge tone="danger" dot>Queried</Badge>}</td>
                        <td>
                          <span className={ui.cellStrong}>{d.title}</span>
                          <span className={`${ui.cellSub} ${d.refNo ? ui.mono : ''}`}>{d.refNo ?? 'No ref no.'}</span>
                        </td>
                        <td>{d.summary}</td>
                        <td className={ui.num} title={d.lines ? undefined : 'Approved since: its lines now carry the later approval'}>{d.lines ? fmtNum(d.lines) : '—'}</td>
                        <td className={ui.cellMuted}>{d.by ?? '—'}</td>
                        <td className={ui.cellMuted}>{d.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  )
}
