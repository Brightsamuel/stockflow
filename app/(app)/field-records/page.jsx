import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { loadReportOptions } from '@/lib/reportOptions'
import ReportBuilder from '@/components/ReportBuilder'

export const metadata = { title: 'Field records' }

// Field records: stock issued to projects (used in the field)
export default async function FieldRecordsPage() {
  if (!(await getCurrentUser())) redirect('/login')
  const [{ owners, projects, takers }, settings] = await Promise.all([loadReportOptions(), getSettings()])
  return <ReportBuilder mode="field" owners={owners} projects={projects} takers={takers} settings={settings} />
}
