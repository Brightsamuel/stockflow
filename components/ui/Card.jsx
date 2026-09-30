import ui from '@/styles/ui.module.css'

// White panel with an optional header (title, subtitle, actions) and footer.
// flush: children sit edge to edge (tables, lists) instead of in a padded body.
export default function Card({ title, subtitle, icon: Icon, actions, footer, flush = false, className = '', children, ...rest }) {
  return (
    <section className={`${ui.card} ${flush ? ui.cardFlush : ''} ${className}`} {...rest}>
      {(title || actions) && (
        <div className={ui.cardHeader}>
          <div>
            {title && (
              <h2 className={ui.cardTitle}>
                {Icon && <Icon size={17} />}
                {title}
              </h2>
            )}
            {subtitle && <p className={ui.cardSubtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={ui.row}>{actions}</div>}
        </div>
      )}
      {flush ? children : <div className={ui.cardBody}>{children}</div>}
      {footer && <div className={ui.cardFooter}>{footer}</div>}
    </section>
  )
}
