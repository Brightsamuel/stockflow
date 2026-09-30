import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { buildProductHistory } from '@/lib/history'
import { NO_OWNER } from '@/lib/owners'
import SearchClient from '@/components/SearchClient'

export const metadata = { title: 'Product history' }

// /search?product=<id> opens that product's history straight away
export default async function SearchPage({ searchParams }) {
  if (!(await getCurrentUser())) redirect('/login')
  const { product } = await searchParams

  const [owners, settings, initialHistory] = await Promise.all([
    prisma.stockOwner.findMany({ where: { id: { not: NO_OWNER } }, orderBy: { name: 'asc' } }),
    getSettings(),
    typeof product === 'string' && product ? buildProductHistory(product) : null,
  ])

  // A new product in the address (e.g. from Quick find) starts a fresh view
  return <SearchClient key={initialHistory?.product.id ?? 'search'} owners={owners} settings={settings} initialHistory={initialHistory} />
}
