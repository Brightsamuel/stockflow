import ui from '@/styles/ui.module.css'
import { toneClass } from '@/components/ui/tone'

// Headline number with an icon, e.g. "Stock value · UGX 12,400,000"
export default function StatCard({ icon: Icon, label, value, hint, tone = 'brand', warn = false }) {
  return (
    <div className={`${ui.stat} ${warn ? ui.statWarn : ''}`}>
      {Icon && (
        <span className={`${ui.statIcon} ${toneClass(tone)}`}>
          <Icon size={20} stroke={1.8} />
        </span>
      )}
      <div className={ui.statBody}>
        <div className={ui.statLabel}>{label}</div>
        <div className={ui.statValue}>{value}</div>
        {hint && <div className={ui.statHint}>{hint}</div>}
      </div>
    </div>
  )
}
