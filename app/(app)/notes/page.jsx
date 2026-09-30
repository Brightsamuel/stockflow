import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { buildNotes } from '@/lib/notes'
import NotesView from '@/components/NotesView'

export const metadata = { title: 'Documents' }

// /notes?ref=RCT-0091 — printable notes for everything recorded under a ref no.
export default async function NotesPage({ searchParams }) {
  if (!(await getCurrentUser())) redirect('/login')
  const { ref } = await searchParams
  const refNo = typeof ref === 'string' ? ref.trim() : ''
  const [settings, notes] = await Promise.all([getSettings(), refNo ? buildNotes(refNo) : []])
  return <NotesView key={refNo} refNo={refNo} notes={notes} settings={settings} />
}
