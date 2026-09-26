import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReportBuilder from '@/components/ReportBuilder'
import { loadReportOptions } from '@/lib/reportOptions'

// Field records: stock issued to projects (used in the field)
export default async function FieldRecordsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  const options = await loadReportOptions()

  return <ReportBuilder {...options} initialScope="field" />
}
