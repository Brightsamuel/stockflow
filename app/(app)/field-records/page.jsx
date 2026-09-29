import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ReportBuilder from '@/components/ReportBuilder'
import { loadReportOptions } from '@/lib/reportOptions'

// Field records: stock issued to projects (used in the field)
export default async function FieldRecordsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  const { owners, projects, takers } = await loadReportOptions()

  return <ReportBuilder owners={owners} projects={projects} takers={takers} fieldRecords />
}
