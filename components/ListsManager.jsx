'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconAlertCircle, IconBuildingCommunity, IconEdit, IconMapPin, IconPlus, IconRuler2, IconSearch, IconTrash, IconUserDollar,
} from '@tabler/icons-react'
import PageHeader from '@/components/ui/PageHeader'
import Tabs from '@/components/ui/Tabs'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import EmptyState from '@/components/ui/EmptyState'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { fmtDate, plural } from '@/lib/format'
import ui from '@/styles/ui.module.css'

const LISTS = {
  units: {
    label: 'Units', singular: 'unit', endpoint: '/api/units', icon: IconRuler2,
    hint: 'What products are measured in, e.g. kg, bag, litre. Names are saved in lower case.',
  },
  owners: {
    label: 'Stock owners', singular: 'owner', endpoint: '/api/owners', icon: IconUserDollar,
    hint: 'Who a batch of stock belongs to. Chosen on Stock in and used to filter reports.',
  },
  projects: {
    label: 'Projects', singular: 'project', endpoint: '/api/projects', icon: IconMapPin, extra: { key: 'location', label: 'Location' },
    hint: 'Field sites that stock is issued to. Their records appear under Field records.',
  },
  recipients: {
    label: 'Recipients', singular: 'recipient', endpoint: '/api/recipients', icon: IconBuildingCommunity, extra: { key: 'company', label: 'Company' },
    hint: 'External people and companies that stock is issued to.',
  },
}

function EntryModal({ list, entry, onClose, onSaved }) {
  const [name, setName] = useState(entry?.name ?? '')
  const [extra, setExtra] = useState(entry?.extra ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Enter a name.'); return }
    setSaving(true); setError('')
    try {
      const body = { name: name.trim(), ...(list.extra && { [list.extra.key]: extra.trim() }) }
      await api(entry ? `${list.endpoint}/${entry.id}` : list.endpoint, { method: entry ? 'PATCH' : 'POST', body })
      onSaved(entry ? `${name.trim()} updated` : `${name.trim()} added`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={entry ? `Edit ${list.singular}` : `New ${list.singular}`}
      subtitle={list.hint}
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="list-entry" className={`${ui.btn} ${ui.btnPrimary}`} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : entry ? 'Save changes' : `Add ${list.singular}`}
          </button>
        </>
      )}
    >
      <form id="list-entry" className={ui.form} onSubmit={submit}>
        <Field label="Name" required>
          <input autoFocus className={ui.input} value={name} onChange={e => setName(e.target.value)} />
        </Field>
        {list.extra && (
          <Field label={list.extra.label} hint="Optional">
            <input className={ui.input} value={extra} onChange={e => setExtra(e.target.value)} />
          </Field>
        )}
        {error && (
          <div className={`${ui.alert} ${ui.alertDanger}`}>
            <IconAlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}

// Admin page for the lists behind the forms. Entries can always be renamed; they can only be
// deleted while nothing uses them, so every record keeps its unit, owner, project or recipient.
export default function ListsManager({ lists, initialTab = 'units' }) {
  const router = useRouter()
  const { confirm, toast } = useConfirm()
  const [tab, setTab] = useState(LISTS[initialTab] ? initialTab : 'units')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // { entry? }

  const list = LISTS[tab]
  const entries = lists[tab]
  const q = query.trim().toLowerCase()
  const visible = entries.filter(e => !q || `${e.name} ${e.extra ?? ''}`.toLowerCase().includes(q))

  async function remove(entry) {
    const ok = await confirm({
      title: `Delete ${list.singular}`,
      message: `Delete "${entry.name}"? This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await api(`${list.endpoint}/${entry.id}`, { method: 'DELETE' })
      toast(`${entry.name} deleted`)
      router.refresh()
    } catch (e) {
      toast(e.message, { type: 'error' })
    }
  }

  return (
    <>
      <PageHeader
        title="Lists"
        subtitle="Units, stock owners, projects and recipients used across the app"
        actions={(
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setEditing({})}>
            <IconPlus size={17} /> New {list.singular}
          </button>
        )}
      />

      <div className={ui.page}>
        <Tabs
          tabs={Object.entries(LISTS).map(([id, l]) => ({ id, label: l.label, icon: l.icon, count: lists[id].length }))}
          active={tab}
          onChange={id => { setTab(id); setQuery('') }}
        />

        <section className={`${ui.card} ${ui.cardFlush}`}>
          <div className={ui.toolbar}>
            <div className={`${ui.inputWrap} ${ui.toolbarSearch}`}>
              <span className={ui.inputIcon}><IconSearch size={16} /></span>
              <input className={`${ui.input} ${ui.inputSm} ${ui.inputWithIcon}`} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${list.label.toLowerCase()}…`} aria-label={`Search ${list.label}`} />
            </div>
            <span className={ui.spacer} />
            <span className={ui.hint}>{list.hint}</span>
          </div>

          {entries.length === 0 ? (
            <EmptyState
              icon={list.icon}
              title={`No ${list.label.toLowerCase()} yet`}
              action={<button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => setEditing({})}><IconPlus size={17} /> New {list.singular}</button>}
            >
              {list.hint}
            </EmptyState>
          ) : (
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    {list.extra && <th>{list.extra.label}</th>}
                    <th>Used by</th>
                    <th>Added</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map(entry => (
                    <tr key={entry.id}>
                      <td className={ui.cellStrong}>{entry.name}</td>
                      {list.extra && <td className={entry.extra ? undefined : ui.cellMuted}>{entry.extra || '—'}</td>}
                      <td className={entry.usage ? undefined : ui.cellMuted}>{entry.usageLabel}</td>
                      <td className={ui.cellMuted}>{fmtDate(entry.createdAt)}</td>
                      <td>
                        <div className={ui.cellActions}>
                          <button type="button" className={ui.iconBtn} title="Edit" onClick={() => setEditing({ entry })}>
                            <IconEdit size={17} />
                          </button>
                          <button
                            type="button"
                            className={`${ui.iconBtn} ${ui.iconBtnDanger}`}
                            title={entry.usage ? `In use, so it can't be deleted (records keep their ${list.singular})` : 'Delete'}
                            onClick={() => remove(entry)}
                            disabled={entry.usage > 0}
                          >
                            <IconTrash size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr><td colSpan={list.extra ? 5 : 4} className={ui.tableEmpty}>Nothing matches &quot;{query.trim()}&quot;.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {entries.length > 0 && (
            <div className={ui.cardFooter}>
              <span className={ui.hint}>{plural(entries.length, list.singular)}. Entries in use can be renamed but not deleted.</span>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <EntryModal
          list={list}
          entry={editing.entry}
          onClose={() => setEditing(null)}
          onSaved={message => { setEditing(null); toast(message); router.refresh() }}
        />
      )}
    </>
  )
}
