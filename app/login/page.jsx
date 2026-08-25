import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LoginForm from '@/components/LoginForm'

export default async function LoginPage() {
  const currentUser = await getCurrentUser()
  if (currentUser) redirect('/')
  return <LoginForm />
}