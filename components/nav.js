import {
  IconClipboardList, IconFileText, IconHistory, IconLayoutDashboard, IconListDetails, IconPackage,
  IconReportAnalytics, IconRosetteDiscountCheck, IconSettings, IconUserCircle, IconUsers,
} from '@tabler/icons-react'

// Pages in the sidebar and Quick find
export const MAIN_NAV = [
  { href: '/', label: 'Overview', icon: IconLayoutDashboard, keywords: 'home dashboard' },
  { href: '/products', label: 'Products', icon: IconPackage, keywords: 'catalogue opening balance' },
  { href: '/search', label: 'Product history', icon: IconHistory, keywords: 'movements search' },
  { href: '/field-records', label: 'Field records', icon: IconClipboardList, keywords: 'projects used taken by' },
  { href: '/reports', label: 'Reports', icon: IconReportAnalytics, keywords: 'balance ledger low stock external ref' },
  { href: '/notes', label: 'Documents', icon: IconFileText, keywords: 'notes grn issue transfer print ref' },
]

// Shown to users with the Approver permission
export const APPROVALS_NAV = { href: '/approvals', label: 'Approvals', icon: IconRosetteDiscountCheck, keywords: 'approve sign off stock out issue' }

export const ADMIN_NAV = [
  { href: '/users', label: 'Users', icon: IconUsers, keywords: 'accounts passwords roles' },
  { href: '/lists', label: 'Lists', icon: IconListDetails, keywords: 'units owners projects recipients' },
  { href: '/settings', label: 'Settings', icon: IconSettings, keywords: 'company logo' },
]

export const ACCOUNT_NAV = { href: '/account', label: 'My account', icon: IconUserCircle, keywords: 'password profile' }

export function isActivePath(pathname, href) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}
