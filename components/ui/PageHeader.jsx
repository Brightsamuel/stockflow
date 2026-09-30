import { Fragment } from 'react'
import Link from 'next/link'
import { IconChevronRight } from '@tabler/icons-react'
import ui from '@/styles/ui.module.css'

// Title bar at the top of every page: breadcrumb, title, subtitle and actions. Not printed.
export default function PageHeader({ title, subtitle, breadcrumb = [], badge, actions }) {
  return (
    <header className={ui.header} data-no-print>
      <div className={ui.headerText}>
        {breadcrumb.length > 0 && (
          <nav className={ui.breadcrumb} aria-label="Breadcrumb">
            {breadcrumb.map((crumb, i) => (
              <Fragment key={i}>
                {i > 0 && <span className={ui.crumbSep}><IconChevronRight size={12} /></span>}
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className={ui.title}>
          {title}
          {badge}
        </h1>
        {subtitle && <p className={ui.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={ui.headerActions}>{actions}</div>}
    </header>
  )
}
