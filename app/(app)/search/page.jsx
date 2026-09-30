import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { buildProductHistory } from '@/lib/history'
import { parseDateRange } from '@/lib/http'
import { NO_OWNER } from '@/lib/owners'
import SearchClient from '@/components/SearchClient'

export const metadata = { title: 'Product history' }

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// /search?product=<id>[&owner=<id>][&from=YYYY-MM-DD][&to=YYYY-MM-DD] opens that product's
// history straight away, for that owner and period
export default async function SearchPage({ searchParams }) {
  if (!(await getCurrentUser())) redirect('/login')
  const params = await searchParams
  const productId = text(params.product)
  let filters = { ownerId: text(params.owner), from: text(params.from), to: text(params.to) }
  let range = { from: null, to: null }
  try {
    range = parseDateRange(filters.from, filters.to)
  } catch {
    // A mistyped date in the address shows the whole history instead
    filters = { ...filters, from: '', to: '' }
  }

  const [owners, settings, initialHistory] = await Promise.all([
    prisma.stockOwner.findMany({ where: { id: { not: NO_OWNER } }, orderBy: { name: 'asc' } }),
    getSettings(),
    productId ? buildProductHistory(productId, { ownerId: filters.ownerId || null, ...range }) : null,
  ])

  // A new product in the address (e.g. from Quick find) starts a fresh view
  return (
    <SearchClient
      key={initialHistory?.product.id ?? 'search'}
      owners={owners}
      settings={settings}
      initialHistory={initialHistory}
      initialFilters={filters}
    />
  )
}
