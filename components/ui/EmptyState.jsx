import ui from '@/styles/ui.module.css'

export default function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className={ui.empty}>
      {Icon && (
        <span className={ui.emptyIcon}>
          <Icon size={26} stroke={1.6} />
        </span>
      )}
      {title && <p className={ui.emptyTitle}>{title}</p>}
      {children && <p className={ui.emptyText}>{children}</p>}
      {action}
    </div>
  )
}
