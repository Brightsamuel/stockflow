import { Fragment } from 'react'
import ui from '@/styles/ui.module.css'
import { cellText } from '@/lib/tables'
import { fmtNum } from '@/lib/format'
import { companyLines } from '@/lib/exporters'

function cellClass(col) {
  const classes = col.num
    ? [ui.num]
    : [col.strong && ui.cellStrong, col.mono && ui.mono, col.muted && ui.cellMuted, col.nowrap && ui.nowrap]
  return classes.filter(Boolean).join(' ') || undefined
}

// Company logo and details, shown on the right of every report and note
export function CompanyBlock({ settings }) {
  const lines = companyLines(settings)
  if (!settings?.logoUrl && !lines.length) return null
  return (
    <div className={ui.docCompany}>
      {settings.logoUrl && (
        // Logos can be uploaded data URLs or any external link, so next/image doesn't fit here
        // eslint-disable-next-line @next/next/no-img-element
        <img src={settings.logoUrl} alt="" className={ui.docLogo} />
      )}
      {lines.map((line, i) => (
        <div key={i} className={i === 0 && settings.companyName ? ui.docCompanyName : undefined}>{line}</div>
      ))}
    </div>
  )
}

// The on-screen (and printed) version of a report, product history or note. Sections use the
// same column definitions as the PDF and Excel exports (see lib/tables). actions: screen-only
// controls for this one document, shown above it and never printed.
export default function ReportDocument({ title, subtitle, meta = [], settings, sections, signatures = [], chips, actions, printPage = false }) {
  const wide = sections.some(s => s.cols.length > 8)
  return (
    <article className={`${ui.doc} ${wide ? ui.docWide : ''}`} data-print-page={printPage ? '' : undefined}>
      {actions && <div className={ui.docActions} data-no-print>{actions}</div>}
      <header className={ui.docHeader}>
        <div>
          <h2 className={ui.docTitle}>{title}</h2>
          {subtitle && <p className={ui.docSubtitle}>{subtitle}</p>}
          {meta.length > 0 && (
            <dl className={ui.docMeta}>
              {meta.map(([label, value]) => (
                <Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{value ?? '—'}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </div>
        <CompanyBlock settings={settings} />
      </header>

      {chips}

      {sections.map((section, i) => (
        <section key={i} className={ui.docSection}>
          {section.title && <h3 className={ui.docSectionTitle}>{section.title}</h3>}
          <div className={ui.docTable}>
            <table className={ui.table}>
              <thead>
                <tr>
                  {section.cols.map(c => <th key={c.label} className={c.num ? ui.num : undefined}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, j) => (
                  <tr key={row.id ?? j}>
                    {section.cols.map(c => (
                      <td key={c.label} className={cellClass(c)}>{c.render ? c.render(row) : cellText(c, row)}</td>
                    ))}
                  </tr>
                ))}
                {section.rows.length === 0 && (
                  <tr><td colSpan={section.cols.length} className={ui.tableEmpty}>{section.empty || 'Nothing to show.'}</td></tr>
                )}
              </tbody>
              {section.footer && (
                <tfoot>
                  <tr>
                    {section.footer.map((v, k) => (
                      <td key={k} className={typeof v === 'number' ? ui.num : undefined}>{typeof v === 'number' ? fmtNum(v) : v}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      ))}

      {signatures.length > 0 && (
        <div className={ui.signatures}>
          {signatures.map(sig => (
            <div key={sig.label} className={ui.signature}>
              <span className={ui.signatureLabel}>{sig.label}</span>
              <span className={ui.signatureLine}><span>Name</span><span>{sig.name}</span></span>
              <span className={ui.signatureLine}><span>Signature</span><span /></span>
              <span className={ui.signatureLine}><span>Date</span><span /></span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
