'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertCircle, IconBuilding, IconEye, IconPhotoUp, IconTrash } from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Field from '@/components/ui/Field'
import { CompanyBlock } from '@/components/ui/ReportDocument'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { datePresets, fmtDate } from '@/lib/format'
import ui from '@/styles/ui.module.css'

const MAX_LOGO_CHARS = 1_400_000

// Resizes an uploaded image to fit 600×200 and returns it as a PNG data URL. Storing the logo
// in the app (instead of linking to another site) means it always appears on printouts and PDFs.
function readLogo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 600 / img.naturalWidth, 200 / img.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That file couldn't be read as an image. Use a PNG or JPG."))
    }
    img.src = url
  })
}

export default function SettingsForm({ initialSettings }) {
  const router = useRouter()
  const { toast } = useConfirm()
  const fileRef = useRef(null)
  const [form, setForm] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const uploaded = form.logoUrl.startsWith('data:')

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      const dataUrl = await readLogo(file)
      if (dataUrl.length > MAX_LOGO_CHARS) throw new Error('That image is too detailed. Try a smaller or simpler logo.')
      set('logoUrl', dataUrl)
    } catch (err) {
      setError(err.message)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await api('/api/settings', { method: 'PATCH', body: form })
      toast('Settings saved')
      router.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Company details shown on reports, documents and the sign-in page" />
      <div className={`${ui.page} ${ui.pageMedium}`}>
        <div className={ui.splitEven}>
          <form onSubmit={submit}>
            <Card
              title="Company profile"
              icon={IconBuilding}
              subtitle="Appears on the right of every printed report, PDF and Excel export"
              footer={(
                <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
                  {saving ? <><span className={ui.spinner} /> Saving…</> : 'Save settings'}
                </button>
              )}
            >
              <div className={ui.form}>
                <Field label="Company name">
                  <input className={ui.input} value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="e.g. Bericot Africa Ltd" />
                </Field>
                <Field label="Address / location">
                  <input className={ui.input} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street, city, country" />
                </Field>
                <div className={ui.formRow2}>
                  <Field label="Phone">
                    <input className={ui.input} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+256 …" />
                  </Field>
                  <Field label="Email">
                    <input type="email" className={ui.input} value={form.email} onChange={e => set('email', e.target.value)} placeholder="info@company.com" />
                  </Field>
                </div>

                <Field label="Logo" asLabel={false} hint="PNG or JPG. It's resized and stored in StockFlow, so it always prints.">
                  <div className={ui.row}>
                    <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => fileRef.current?.click()}>
                      <IconPhotoUp size={15} /> {form.logoUrl ? 'Replace logo' : 'Upload logo'}
                    </button>
                    {form.logoUrl && (
                      <button type="button" className={`${ui.btn} ${ui.btnDangerGhost} ${ui.btnSm}`} onClick={() => set('logoUrl', '')}>
                        <IconTrash size={15} /> Remove
                      </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} hidden />
                  </div>
                </Field>
                {!uploaded && (
                  <Field label="…or a link to the logo" hint="Some sites block linked images from appearing in PDFs; uploading is more reliable.">
                    <input className={ui.input} value={form.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://…" />
                  </Field>
                )}

                {error && (
                  <div className={`${ui.alert} ${ui.alertDanger}`}>
                    <IconAlertCircle size={17} />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </Card>
          </form>

          <Card title="Preview" icon={IconEye} subtitle="How the header of a report will look">
            <div className={ui.stack}>
              <div className={ui.docHeader}>
                <div>
                  <div className={ui.docTitle}>Stock balance · Main store</div>
                  <div className={ui.docSubtitle}>{fmtDate(datePresets()[0].from)} – {fmtDate(datePresets()[0].to)}</div>
                </div>
                <CompanyBlock settings={form} />
              </div>
              {!form.logoUrl && !form.companyName && (
                <p className={ui.hint}>Add your company details to see them here.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
