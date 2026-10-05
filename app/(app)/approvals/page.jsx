import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { listPendingNotes, listRecentDecisions } from '@/lib/approvals'
import ApprovalsView from '@/components/ApprovalsView'

export const metadata = { title: 'Approvals' }

// Stock outs waiting for an approver's sign-off, those queried, and recent decisions.
// Anyone signed in can see it; only users with the Approver permission can approve.
export default async function ApprovalsPage({ searchParams }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { tab } = await searchParams
  const [settings, notes, recent] = await Promise.all([getSettings(), listPendingNotes(), listRecentDecisions()])
  return (
    <ApprovalsView
      notes={notes}
      recent={recent}
      settings={settings}
      currentUser={{ id: user.id, canApprove: user.canApprove }}
      initialTab={['queried', 'recent'].includes(tab) ? tab : 'awaiting'}
    />
  )
}
