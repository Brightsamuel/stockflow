import ui from '@/styles/ui.module.css'

// Label + control + hint. Rendered as a <label> so clicking the text focuses the control;
// pass asLabel={false} when the field holds several controls or buttons.
export default function Field({ label, hint, required = false, asLabel = true, className = '', children }) {
  const Tag = asLabel ? 'label' : 'div'
  return (
    <Tag className={`${ui.field} ${className}`}>
      {label && (
        <span className={ui.label}>
          {label}
          {required && <span className={ui.required}>*</span>}
        </span>
      )}
      {children}
      {hint && <span className={ui.hint}>{hint}</span>}
    </Tag>
  )
}
