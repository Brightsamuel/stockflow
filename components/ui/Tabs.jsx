import ui from '@/styles/ui.module.css'

// tabs: [{ id, label, count?, icon? }]
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className={ui.tabs} role="tablist" data-no-print>
      {tabs.map(({ id, label, count, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`${ui.tab} ${active === id ? ui.tabActive : ''}`}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={16} />}
          {label}
          {count != null && <span className={ui.tabCount}>{count}</span>}
        </button>
      ))}
    </div>
  )
}
