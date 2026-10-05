'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconBuildingStore, IconPackage, IconSearch } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { isAdminRole } from '@/lib/constants'
import { MAIN_NAV, ADMIN_NAV, ACCOUNT_NAV, APPROVALS_NAV } from '@/components/nav'
import ui from '@/styles/ui.module.css'

function matches(text, q) {
  return text.toLowerCase().includes(q)
}

// Jump to a page, a store or a product's history (Ctrl+K)
export default function QuickFind({ categories, currentUser, onClose }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [products, setProducts] = useState([])
  const [active, setActive] = useState(0)

  const term = q.trim().toLowerCase()

  useEffect(() => {
    if (term.length < 2) return undefined
    const timer = setTimeout(() => {
      api(`/api/search?lite=1&q=${encodeURIComponent(term)}`)
        .then(data => setProducts(Array.isArray(data) ? data : []))
        .catch(() => setProducts([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [term])

  const pages = [
    ...MAIN_NAV,
    ...(currentUser.canApprove ? [APPROVALS_NAV] : []),
    ...(isAdminRole(currentUser.role) ? ADMIN_NAV : []),
    ACCOUNT_NAV,
  ]
    .filter(p => !term || matches(`${p.label} ${p.keywords}`, term))
    .map(p => ({ key: p.href, group: 'Pages', label: p.label, href: p.href, icon: p.icon }))

  const stores = categories
    .flatMap(c => c.stores.map(s => ({ ...s, category: c.name })))
    .filter(s => !term || matches(`${s.name} ${s.category}`, term))
    .slice(0, term ? 8 : 5)
    .map(s => ({ key: s.id, group: 'Stores', label: s.name, sub: s.category, href: `/store/${s.id}`, icon: IconBuildingStore }))

  const productItems = (term.length >= 2 ? products : []).map(p => ({
    key: p.id, group: 'Product history', label: p.name, sub: p.unit.name, href: `/search?product=${p.id}`, icon: IconPackage,
  }))

  const items = [...pages, ...stores, ...productItems]
  const current = Math.min(active, Math.max(items.length - 1, 0))

  function go(item) {
    onClose()
    router.push(item.href)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(current + 1, items.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(current - 1, 0)) }
    if (e.key === 'Enter' && items[current]) { e.preventDefault(); go(items[current]) }
  }

  return (
    <Modal title="Quick find" subtitle="Pages, stores and products" size="lg" onClose={onClose} closeOnBackdrop>
      <div className={ui.inputWrap}>
        <span className={ui.inputIcon}><IconSearch size={17} /></span>
        <input
          autoFocus
          className={`${ui.input} ${ui.inputWithIcon}`}
          value={q}
          onChange={e => { setQ(e.target.value); setActive(0) }}
          onKeyDown={onKeyDown}
          placeholder="Type a page, store or product name…"
        />
      </div>

      <div className={ui.qfList}>
        {items.length === 0 && <p className={ui.suggestEmpty}>Nothing matches &quot;{q.trim()}&quot;.</p>}
        {items.map((item, i) => {
          const Icon = item.icon
          return (
            <div key={`${item.group}:${item.key}`}>
              {(i === 0 || items[i - 1].group !== item.group) && <div className={ui.qfGroup}>{item.group}</div>}
              <button
                type="button"
                className={`${ui.qfItem} ${i === current ? ui.qfItemActive : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
              >
                <span className={ui.qfIcon}><Icon size={17} /></span>
                <span className={ui.qfLabel}>{item.label}</span>
                {item.sub && <span className={ui.qfSub}>{item.sub}</span>}
              </button>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
