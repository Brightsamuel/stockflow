import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { loadReportOptions } from '@/lib/reportOptions'
import ReportBuilder from '@/components/ReportBuilder'

export const metadata = { title: 'Reports' }

export default async function ReportsPage() {
  if (!(await getCurrentUser())) redirect('/login')
  const [options, settings] = await Promise.all([loadReportOptions(), getSettings()])
  return <ReportBuilder {...options} settings={settings} />
}
