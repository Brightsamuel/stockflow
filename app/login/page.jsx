import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import LoginForm from '@/components/LoginForm'

export const metadata = { title: 'Sign in' }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  const [userCount, settings] = await Promise.all([prisma.user.count(), getSettings()])
  return <LoginForm firstRun={userCount === 0} companyName={settings.companyName} logoUrl={settings.logoUrl} />
}
