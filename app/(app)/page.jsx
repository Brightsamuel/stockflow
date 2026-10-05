import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  IconAlertTriangle, IconArrowBarToDown, IconBuildingStore, IconBuildingWarehouse, IconClipboardList, IconCoins,
  IconFileText, IconHistory, IconPackage, IconReportAnalytics, IconTruckDelivery,
} from '@tabler/icons-react'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/constants'
import { ownerLabel } from '@/lib/owners'
import { LIVE, movementKind, signedChange } from '@/lib/movements'
import { TIME_ZONE, TIME_ZONE_OFFSET, fmtDate, fmtMoney, fmtNum, fmtSigned, plural, todayInput } from '@/lib/format'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import EmptyState from '@/components/ui/EmptyState'
import Badge, { MovementBadge } from '@/components/ui/Badge'
import ui from '@/styles/ui.module.css'

export const metadata = { title: 'Overview' }

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TIME_ZONE }).format(new Date()))
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

// Midnight on the 1st of this month, Kampala time
function monthStart() {
  return new Date(`${todayInput().slice(0, 8)}01T00:00:00${TIME_ZONE_OFFSET}`)
}

export default async function OverviewPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  const canManage = isAdminRole(currentUser.role)

  const [entries, stores, productCount, monthLogs, recent] = await Promise.all([
    prisma.stockEntry.findMany({
      where: { isDeleted: false },
      select: {
        id: true, quantity: true, rate: true, lowStockAt: true, storeId: true, productId: true,
        product: { select: { name: true, unit: { select: { name: true } } } },
        owner: { select: { id: true, name: true } },
        store: { select: { name: true, category: { select: { isSystem: true } } } },
      },
    }),
    prisma.store.findMany({
      where: { category: { isSystem: false } },
      select: { id: true, name: true, category: { select: { id: true, name: true } } },
      orderBy: [{ category: { createdAt: 'asc' } }, { createdAt: 'asc' }],
    }),
    prisma.product.count(),
    prisma.stockLog.findMany({
      where: { entryDate: { gte: monthStart() }, type: { in: ['IN', 'TRANSFER_OUT', 'RETURN'] }, ...LIVE },
      select: { type: true, quantity: true, rate: true, projectId: true, recipientId: true, store: { select: { category: { select: { isSystem: true } } } } },
    }),
    prisma.stockLog.findMany({
      where: { type: { not: 'TRANSFER_IN' }, ...LIVE },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        product: { include: { unit: true } },
        store: { select: { id: true, name: true, category: { select: { isSystem: true } } } },
        user: { select: { username: true } },
        project: { select: { name: true } },
        recipient: { select: { name: true } },
      },
    }),
  ])

  if (stores.length === 0) {
    return (
      <>
        <PageHeader title={`${greeting()}, ${currentUser.username}`} subtitle="Welcome to StockFlow" />
        <div className={ui.page}>
          <Card>
            <EmptyState icon={IconBuildingWarehouse} title="Set up your first store">
              {canManage
                ? 'Use the + next to "Stores" in the sidebar to create a category (for example "Main warehouse"), then add stores to it. Products are created under Products and received into a store with Stock in.'
                : 'No stores have been set up yet. Ask an administrator to create them; they will appear in the sidebar.'}
            </EmptyState>
          </Card>
        </div>
      </>
    )
  }

  const storeEntries = entries.filter(e => !e.store.category.isSystem)
  const stockValue = entries.reduce((s, e) => s + e.quantity * e.rate, 0)
  const openingValue = stockValue - storeEntries.reduce((s, e) => s + e.quantity * e.rate, 0)
  const low = storeEntries
    .filter(e => e.lowStockAt > 0 && e.quantity <= e.lowStockAt)
    .sort((a, b) => a.quantity / a.lowStockAt - b.quantity / b.lowStockAt)
  const productsInStores = new Set(storeEntries.filter(e => e.quantity > 0).map(e => e.productId)).size

  const monthValue = test => monthLogs.filter(test).reduce((s, l) => s + l.quantity * l.rate, 0)
  const received = monthValue(l => l.type === 'IN' && !l.store.category.isSystem)
  // Used on projects: what was issued to them, less what came back
  const used = monthValue(l => l.type === 'TRANSFER_OUT' && l.projectId) - monthValue(l => l.type === 'RETURN')
  const issued = monthValue(l => l.type === 'TRANSFER_OUT' && l.recipientId)

  const perStore = new Map(stores.map(s => [s.id, { ...s, items: 0, value: 0, low: 0 }]))
  storeEntries.forEach(e => {
    const row = perStore.get(e.storeId)
    if (!row) return
    row.items += 1
    row.value += e.quantity * e.rate
    if (e.lowStockAt > 0 && e.quantity <= e.lowStockAt) row.low += 1
  })
  const categoryCount = new Set(stores.map(s => s.category.id)).size

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${currentUser.username}`}
        subtitle={`Here's where your stock stands today, ${fmtDate(new Date())}.`}
        actions={(
          <>
            <Link href="/field-records" className={`${ui.btn} ${ui.btnSecondary}`}><IconClipboardList size={17} /> Field records</Link>
            <Link href="/reports" className={`${ui.btn} ${ui.btnPrimary}`}><IconReportAnalytics size={17} /> Reports</Link>
          </>
        )}
      />

      <div className={ui.page}>
        <div className={`${ui.grid} ${ui.cols4}`}>
          <StatCard icon={IconCoins} tone="brand" label="Stock value" value={fmtMoney(stockValue)} hint={openingValue ? `Includes ${fmtMoney(openingValue)} in opening balances` : 'At current rates'} />
          <StatCard icon={IconPackage} tone="info" label="Products" value={fmtNum(productCount)} hint={`${fmtNum(productsInStores)} held in stores`} />
          <StatCard icon={IconBuildingStore} tone="teal" label="Stores" value={fmtNum(stores.length)} hint={plural(categoryCount, 'category', 'categories')} />
          <StatCard
            icon={IconAlertTriangle}
            tone={low.length ? 'warning' : 'success'}
            warn={low.length > 0}
            label="Low stock"
            value={fmtNum(low.length)}
            hint={low.length ? 'Items at or below their alert level' : 'Nothing is running low'}
          />
        </div>

        <div className={`${ui.grid} ${ui.cols3}`}>
          <StatCard icon={IconArrowBarToDown} tone="success" label="Received this month" value={fmtMoney(received)} />
          <StatCard icon={IconClipboardList} tone="warning" label="Used on projects this month" value={fmtMoney(used)} />
          <StatCard icon={IconTruckDelivery} tone="neutral" label="Issued externally this month" value={fmtMoney(issued)} />
        </div>

        <div className={ui.split}>
          <Card
            title="Recent movements"
            icon={IconHistory}
            subtitle="The latest stock recorded across all stores"
            flush
            actions={<Link href="/reports" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSm}`}>Movement ledger</Link>}
          >
            {recent.length === 0 ? (
              <EmptyState icon={IconHistory} title="Nothing recorded yet">Stock in, transfers and stock outs will show up here.</EmptyState>
            ) : (
              <div className={ui.list}>
                {recent.map(l => {
                  const kind = movementKind(l, l.store.category.isSystem)
                  const to = l.project?.name ?? l.recipient?.name ?? (l.type === 'TRANSFER_OUT' ? l.note?.replace(/^(Transferred|Opening stock issued) to /, '') : null)
                  return (
                    <div key={l.id} className={ui.listItem}>
                      <MovementBadge kind={kind} />
                      <div className={ui.listMain}>
                        <div className={`${ui.listTitle} ${ui.truncate}`}>
                          <Link href={`/search?product=${l.productId}`} className={ui.cellLink}>{l.product.name}</Link>
                        </div>
                        <div className={`${ui.listMeta} ${ui.truncate}`}>
                          {l.type === 'RETURN'
                            ? `${to} → ${l.store.name}`
                            : <>{l.store.category.isSystem ? 'Opening balance' : l.store.name}{to ? ` → ${to}` : ''}</>}
                          {l.user ? ` · ${l.user.username}` : ''}
                          {l.refNo && <> · <Link href={`/notes?ref=${encodeURIComponent(l.refNo)}`} className={ui.link}>{l.refNo}</Link></>}
                        </div>
                      </div>
                      <div className={ui.listSide}>
                        <div className={ui.strong}>{fmtSigned(signedChange(l))} {l.product.unit.name}</div>
                        <div className={ui.listMeta}>{fmtDate(l.entryDate)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="Running low" icon={IconAlertTriangle} subtitle="At or below their alert level" flush>
            {low.length === 0 ? (
              <EmptyState icon={IconPackage} title="All good">No item is at or below its low-stock alert.</EmptyState>
            ) : (
              <div className={ui.list}>
                {low.slice(0, 6).map(e => (
                  <Link key={e.id} href={`/store/${e.storeId}`} className={ui.listItem}>
                    <div className={ui.listMain}>
                      <div className={`${ui.listTitle} ${ui.truncate}`}>{e.product.name}</div>
                      <div className={`${ui.listMeta} ${ui.truncate}`}>
                        {e.store.name}{ownerLabel(e.owner) !== '—' ? ` · ${ownerLabel(e.owner)}` : ''}
                      </div>
                    </div>
                    <div className={ui.listSide}>
                      <div className={ui.strong}>{fmtNum(e.quantity)} / {fmtNum(e.lowStockAt)} {e.product.unit.name}</div>
                      <div className={ui.meter}><div className={ui.meterFill} style={{ width: `${Math.min(100, (e.quantity / e.lowStockAt) * 100)}%` }} /></div>
                    </div>
                  </Link>
                ))}
                {low.length > 6 && (
                  <Link href="/reports" className={ui.listItem}>
                    <span className={ui.link}>See all {fmtNum(low.length)} in the Low stock report</span>
                  </Link>
                )}
              </div>
            )}
          </Card>
        </div>

        <Card title="Stores" icon={IconBuildingStore} subtitle="Stock held in each store at current rates" flush>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Category</th>
                  <th className={ui.num}>Items</th>
                  <th className={ui.num}>Value (UGX)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...perStore.values()].map(s => (
                  <tr key={s.id}>
                    <td><Link href={`/store/${s.id}`} className={ui.cellLink}>{s.name}</Link></td>
                    <td className={ui.cellMuted}>{s.category.name}</td>
                    <td className={ui.num}>{fmtNum(s.items)}</td>
                    <td className={ui.num}>{fmtNum(s.value)}</td>
                    <td>
                      {s.low > 0
                        ? <Badge tone="warning" dot>{plural(s.low, 'item')} low</Badge>
                        : s.items > 0 ? <Badge tone="success" dot>Healthy</Badge> : <Badge tone="neutral">Empty</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className={`${ui.grid} ${ui.cols4}`} data-no-print>
          {[
            { href: '/products', icon: IconPackage, title: 'Products', text: 'Catalogue and opening balances' },
            { href: '/search', icon: IconHistory, title: 'Product history', text: 'Every movement of a product' },
            { href: '/field-records', icon: IconClipboardList, title: 'Field records', text: 'Stock used on projects' },
            { href: '/notes', icon: IconFileText, title: 'Documents', text: 'Printable notes by ref no.' },
          ].map(({ href, icon: Icon, title, text }) => (
            <Link key={href} href={href} className={ui.pickerItem}>
              <span className={ui.pickerIcon}><Icon size={18} /></span>
              <span>
                <span className={ui.pickerTitle}>{title}</span>
                <span className={ui.pickerText}>{text}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
