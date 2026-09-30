'use client'
import { useState } from 'react'
import { IconFileSpreadsheet, IconFileTypePdf, IconPrinter } from '@tabler/icons-react'
import { useConfirm } from '@/components/ConfirmProvider'
import ui from '@/styles/ui.module.css'

// Print / Generate PDF / Export to Excel for whatever document is on screen. Always visible;
// leave out onPdf or onExcel to hide that button.
export default function ExportBar({ info, onPdf, onExcel }) {
  const { toast } = useConfirm()
  const [busy, setBusy] = useState(null)

  async function run(kind, action) {
    setBusy(kind)
    try {
      await action()
    } catch (e) {
      console.error(e)
      toast('The export could not be created. Please try again.', { type: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={ui.exportBar} data-no-print>
      <div className={ui.exportInfo}>{info}</div>
      <div className={ui.row}>
        <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => window.print()}>
          <IconPrinter size={16} /> Print
        </button>
        {onPdf && (
          <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => run('pdf', onPdf)} disabled={busy !== null}>
            {busy === 'pdf' ? <span className={ui.spinner} /> : <IconFileTypePdf size={16} />} Generate PDF
          </button>
        )}
        {onExcel && (
          <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => run('excel', onExcel)} disabled={busy !== null}>
            {busy === 'excel' ? <span className={ui.spinner} /> : <IconFileSpreadsheet size={16} />} Export to Excel
          </button>
        )}
      </div>
    </div>
  )
}
