'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowRight, IconFileText, IconSearch } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Field from '@/components/ui/Field'
import ExportBar from '@/components/ui/ExportBar'
import ReportDocument from '@/components/ui/ReportDocument'
import EmptyState from '@/components/ui/EmptyState'
import RefSearch from '@/components/RefSearch'
import { plural } from '@/lib/format'
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

export default function NotesView({ refNo, notes, settings }) {
  const router = useRouter()
  const [query, setQuery] = useState(refNo)
  const documents = notes.map(toDocument)

  function open(value) {
    const ref = value.trim()
    if (ref) router.push(`/notes?ref=${encodeURIComponent(ref)}`)
  }

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Printable received, issue and transfer notes with signature lines, by ref no."
      />
      <div className={ui.page}>
        <form className={ui.card} onSubmit={e => { e.preventDefault(); open(query) }} data-no-print>
          <div className={ui.cardBody}>
            <div className={`${ui.row} ${ui.rowEnd}`}>
              <Field label="Ref no." asLabel={false} className={ui.toolbarSearch}>
                <RefSearch value={query} onChange={setQuery} onPick={open} autoFocus={!refNo} />
              </Field>
              <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
                <IconSearch size={16} /> Open
              </button>
            </div>
          </div>
        </form>

        {!refNo && (
          <section className={ui.card} data-no-print>
            <EmptyState icon={IconFileText} title="Find a ref no.">
              Every stock in, transfer and stock out saved with a ref no. has a printable note: a Goods Received Note,
              a Material Issue Note, a Goods Issue Note or a Stock Transfer Note, with lines to sign.
            </EmptyState>
          </section>
        )}

        {refNo && documents.length === 0 && (
          <section className={ui.card}>
            <EmptyState icon={IconFileText} title={`Nothing recorded under ${refNo}`}>
              Check the ref no. or pick one from the suggestions.
            </EmptyState>
          </section>
        )}

        {documents.length > 0 && (
          <>
            <ExportBar
              info={<><strong className={ui.strong}>{plural(documents.length, 'document')}</strong> for {refNo}{documents.length > 1 && <> · each prints on its own page <IconArrowRight size={14} /></>}</>}
              onPdf={() => exportPdfDocuments({ documents, settings, fileBase: `note-${fileSafe(refNo)}` })}
            />
            {documents.map((doc, i) => (
              <ReportDocument key={notes[i].id} {...doc} settings={settings} printPage={documents.length > 1} />
            ))}
          </>
        )}
      </div>
    </>
  )
}
