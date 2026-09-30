import ui from '@/styles/ui.module.css'

// Shown instantly while a page's data loads (the sidebar stays usable)
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className={ui.header}>
        <div className={ui.headerText}>
          <div className={ui.skeleton} style={{ width: 120, height: 12 }} />
          <div className={ui.skeleton} style={{ width: 260, height: 24, marginTop: 6 }} />
        </div>
      </div>
      <div className={ui.page}>
        <div className={`${ui.grid} ${ui.cols4}`}>
          {[0, 1, 2, 3].map(i => <div key={i} className={ui.skeleton} style={{ height: 86, borderRadius: 12 }} />)}
        </div>
        <div className={ui.skeleton} style={{ height: 360, borderRadius: 12 }} />
      </div>
    </div>
  )
}
