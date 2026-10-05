import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { buildNotes, noteScope } from '@/lib/notes'
import { listDeletions } from '@/lib/deletions'
import NotesView from '@/components/NotesView'

export const metadata = { title: 'Documents' }

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// /notes?ref=RCT-0091  printable notes for everything recorded under a ref no.
// /notes?log=<id>      the note of a stock in or stock out saved without a ref no.
// /notes?tab=deleted   deleted notes, with restore (Super admin)
export default async function NotesPage({ searchParams }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const params = await searchParams
  const refNo = text(params.ref)
  const logId = refNo ? '' : text(params.log)

  // A line that belongs to a ref no. opens the whole ref no.
  if (logId) {
    const scope = await noteScope(prisma, { logId })
    if (scope?.refNo) redirect(`/notes?ref=${encodeURIComponent(scope.refNo)}`)
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN'
  const [settings, notes, deletions] = await Promise.all([
    getSettings(),
    refNo || logId ? buildNotes({ refNo: refNo || null, logId: logId || null }) : [],
    isSuperAdmin ? listDeletions() : [],
  ])
  const tab = isSuperAdmin && params.tab === 'deleted' ? 'deleted' : 'notes'

  return (
    <NotesView
      key={`${refNo}|${logId}|${tab}`}
      refNo={refNo}
      logId={logId}
      notes={notes}
      settings={settings}
      canDelete={isSuperAdmin}
      deletions={deletions}
      initialTab={tab}
      currentUser={{ id: user.id, canApprove: user.canApprove }}
    />
  )
}
