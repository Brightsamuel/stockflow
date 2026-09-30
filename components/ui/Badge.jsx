import ui from '@/styles/ui.module.css'
import { toneClass } from '@/components/ui/tone'
import { MOVEMENT } from '@/lib/movements'

export default function Badge({ tone = 'neutral', dot = false, title, children }) {
  return (
    <span className={`${ui.badge} ${toneClass(tone)} ${dot ? ui.badgeDot : ''}`} title={title}>
      {children}
    </span>
  )
}

// Badge for a movement kind from lib/movements (Received, Used, Transfer out, …)
export function MovementBadge({ kind }) {
  const movement = MOVEMENT[kind] ?? MOVEMENT.EDITED
  return <Badge tone={movement.tone}>{movement.label}</Badge>
}
