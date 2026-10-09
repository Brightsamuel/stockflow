'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconAlertCircle, IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconPlus, IconX } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { useConfirm } from '@/components/ConfirmProvider'
import { api } from '@/lib/api'
import { fmtMoney, fmtNum, plural, todayInput } from '@/lib/format'
import { NO_OWNER } from '@/lib/owners'
import { postMovement, useList, useRefExists, useScrollOnAdd, nextLineKey } from './hooks'
import ui from '@/styles/ui.module.css'

// Transfer moves stock to another store; Stock out takes it out of the inventory as used
// (project / field) or issued (external party). Manage Products also uses this modal to
// issue from an opening balance.
export const TRANSFER_DESTINATIONS = ['store']
export const STOCK_OUT_DESTINATIONS = ['project', 'external']
export const ISSUE_DESTINATIONS = ['store', 'project', 'external']

const NEW_RECIPIENT = '__new_recipient__'
const NEW_PROJECT = '__new_project__'
const NEW_OWNER = '__new_owner__'

const DESTINATION_LABEL = {
  store: 'Another store',
  project: 'A project (field use)',
  external: 'An external party',
}

function blankLine(entryId = '') {
  return { key: nextLineKey(), entryId, quantity: '' }
}

function itemLabel(item) {
  const owner = item.owner && item.owner !== '—' ? ` · ${item.owner}` : ''
  const kept = item.keptFor ? ` · for ${item.keptFor}` : ''
  return `${item.name}${owner}${kept} — ${fmtNum(item.quantity)} ${item.unit} available`
}

// Stock kept for a project goes only to that project, or to another store (still kept for it)
function canSend(item, destType, projectId) {
  if (!item?.forProjectId) return true
  if (destType === 'store') return true
  return destType === 'project' && item.forProjectId === projectId
}

// store: { id, name, items: [{ id, name, unit, owner, rate, quantity }] }
// openingBalance: issuing from a product's opening balance, which has no owner; issued to a store,
// the stock owner is chosen here
export default function StockMoveModal({ title, destinations, store, allStores, onClose, onDone, initialItemId = '', allowNext = true, openingBalance = false }) {
  const router = useRouter()
  const { confirm, toast } = useConfirm()
  const today = todayInput()
  const [destType, setDestType] = useState(destinations[0])
  const [targetStoreId, setTargetStoreId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [newProject, setNewProject] = useState({ name: '', location: '' })
  const [recipientId, setRecipientId] = useState('')
  const [newRecipient, setNewRecipient] = useState({ name: '', company: '' })
  const [takenBy, setTakenBy] = useState('')
  const [issuedBy, setIssuedBy] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [people] = useList('/api/people')
  const [refNo, setRefNo] = useState('')
  const [entryDate, setEntryDate] = useState(today)
  const [lines, setLines] = useState(() => [blankLine(initialItemId)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const needsProjects = destinations.includes('project')
  const [projects, setProjects] = useList('/api/projects', needsProjects)
  const [recipients, setRecipients] = useList('/api/recipients', destinations.includes('external'))
  const [takers, setTakers] = useList('/api/taken-by', needsProjects)
  const [owners, setOwners] = useList('/api/owners', openingBalance)
  const [ownerId, setOwnerId] = useState('')
  const [newOwnerName, setNewOwnerName] = useState('')

  // Stock going out to a project (the field) must say who is taking it
  const needsTaker = destType === 'project'
  // Opening stock going into a store is given its owner (or "No owner") on purpose
  const needsOwner = openingBalance && destType === 'store'

  const refExists = useRefExists(refNo)
  const bodyRef = useScrollOnAdd(lines.length)
  const itemsById = Object.fromEntries(store.items.map(i => [i.id, i]))
  const choices = store.items.filter(i => canSend(i, destType, projectId))
  const filled = lines.filter(l => l.entryId || l.quantity !== '')
  const total = lines.reduce((s, l) => s + (itemsById[l.entryId]?.rate ?? 0) * (parseFloat(l.quantity) || 0), 0)

  function setLine(key, field, value) {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, [field]: value } : l)))
  }

  function removeLine(key) {
    setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls))
  }

  function validate() {
    if (filled.length === 0) return 'Add at least one item.'
    const bad = filled.find(l => !l.entryId || !(parseFloat(l.quantity) > 0))
    if (bad) return `Line ${lines.indexOf(bad) + 1}: choose an item and enter a quantity above 0.`
    const kept = filled.find(l => !canSend(itemsById[l.entryId], destType, projectId))
    if (kept) {
      const item = itemsById[kept.entryId]
      return `Line ${lines.indexOf(kept) + 1}: this ${item.name} is kept for ${item.keptFor}, so it can only go to that project or another store.`
    }

    // The same row can appear on several lines; together they can't exceed what's available
    const wanted = {}
    filled.forEach(l => { wanted[l.entryId] = (wanted[l.entryId] ?? 0) + parseFloat(l.quantity) })
    const short = Object.entries(wanted).find(([id, qty]) => qty > itemsById[id].quantity)
    if (short) {
      const item = itemsById[short[0]]
      return `Only ${fmtNum(item.quantity)} ${item.unit} of ${item.name} available.`
    }
    if (!entryDate) return 'Choose a date.'
    if (destType === 'store' && !targetStoreId) return 'Choose the destination store.'
    if (needsOwner && !ownerId) return 'Choose who this stock belongs to, or "No owner".'
    if (needsOwner && ownerId === NEW_OWNER && !newOwnerName.trim()) return "Enter the new owner's name."
    if (destType === 'project' && !projectId) return 'Choose a project, or "+ New project".'
    if (destType === 'project' && projectId === NEW_PROJECT && !newProject.name.trim()) return 'Enter the project name.'
    if (destType === 'external' && !recipientId) return 'Choose a recipient, or "+ New recipient".'
    if (destType === 'external' && recipientId === NEW_RECIPIENT && !newRecipient.name.trim()) return "Enter the recipient's name."
    if (needsTaker && !takenBy.trim()) return 'Enter who is taking the stock to the project (Taken by).'
    return null
  }

  async function submit(keepOpen) {
    const problem = validate()
    if (problem) { setError(problem); return }

    setSaving(true); setError(''); setSaved('')
    try {
      const body = {
        sourceStoreId: store.id,
        refNo: refNo.trim() || null,
        entryDate,
        takenBy: needsTaker ? takenBy.trim() : null,
        issuedBy: issuedBy.trim() || null,
        receivedBy: needsTaker ? null : receivedBy.trim() || null,
        items: filled.map(l => ({ entryId: l.entryId, quantity: parseFloat(l.quantity) })),
      }

      if (destType === 'store') {
        body.targetStoreId = targetStoreId
        if (needsOwner) {
          body.ownerId = ownerId
          if (ownerId === NEW_OWNER) {
            const owner = await api('/api/owners', { method: 'POST', body: { name: newOwnerName.trim() } })
            setOwners(list => [...list, owner].sort((a, b) => a.name.localeCompare(b.name)))
            setOwnerId(owner.id)
            setNewOwnerName('')
            body.ownerId = owner.id
          }
        }
      } else if (destType === 'project') {
        body.projectId = projectId
        if (projectId === NEW_PROJECT) {
          const project = await api('/api/projects', { method: 'POST', body: { name: newProject.name.trim(), location: newProject.location.trim() } })
          setProjects(list => [...list, project].sort((a, b) => a.name.localeCompare(b.name)))
          setProjectId(project.id)
          setNewProject({ name: '', location: '' })
          body.projectId = project.id
        }
      } else {
        body.recipientId = recipientId
        if (recipientId === NEW_RECIPIENT) {
          const recipient = await api('/api/recipients', { method: 'POST', body: { name: newRecipient.name.trim(), company: newRecipient.company.trim() } })
          setRecipients(list => [...list, recipient].sort((a, b) => a.name.localeCompare(b.name)))
          setRecipientId(recipient.id)
          setNewRecipient({ name: '', company: '' })
          body.recipientId = recipient.id
        }
      }

      const data = await postMovement('/api/transfers', body, confirm)
      if (!data) return
      const verb = destType === 'store' ? 'transferred' : destType === 'project' ? 'issued to the project' : 'issued'
      const summary = `${plural(data.count, 'item')} ${verb}${data.refNo ? ` under ${data.refNo}` : ''}.`
      const noteLabel = destType === 'store' ? 'Print transfer note' : 'Print issue note'
      toast(summary, { action: data.refNo ? { label: noteLabel, href: `/notes?ref=${encodeURIComponent(data.refNo)}` } : undefined })
      if (!keepOpen) { onDone(); return }

      setSaved(`${summary} Enter the next ref no.`)
      if (needsTaker) {
        const name = takenBy.trim()
        setTakers(list => (list.includes(name) ? list : [...list, name].sort()))
        setTakenBy('')
      }
      setRefNo('')
      setLines([blankLine()])
      router.refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const note = destType === 'store'
    ? <>Stock moves from <strong>{store.name}</strong> to the destination store. The total inventory doesn&apos;t change.</>
    : destType === 'project'
      ? <>Stock leaves the inventory and is recorded as <strong>used</strong> on the project. It appears under Field records.</>
      : <>Stock leaves the inventory and is recorded as <strong>issued</strong> to the external party.</>

  return (
    <Modal
      title={title}
      subtitle={`From ${store.name}`}
      size="xl"
      onClose={onClose}
      dismissible={!saving}
      bodyRef={bodyRef}
      footer={(
        <>
          <span className={ui.modalFooterStart}>
            {filled.length > 0 ? <>{plural(filled.length, 'item')} · <strong>{fmtMoney(total)}</strong></> : 'No items yet'}
          </span>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={saving}>
            {saved ? 'Close' : 'Cancel'}
          </button>
          {allowNext && (
            <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={() => submit(true)} disabled={saving}>
              Save &amp; next ref no.
            </button>
          )}
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={() => submit(false)} disabled={saving}>
            {saving ? <><span className={ui.spinner} /> Saving…</> : filled.length > 0 ? `Save ${plural(filled.length, 'item')}` : 'Save'}
          </button>
        </>
      )}
    >
      <div className={ui.formRow3}>
        <Field label="Ref no." hint="Optional, e.g. the issue form number">
          <input autoFocus className={ui.input} value={refNo} onChange={e => { setRefNo(e.target.value); setSaved('') }} placeholder="e.g. MIF-0042" />
        </Field>
        <Field label="Date" required>
          <input type="date" className={ui.input} value={entryDate} max={today} onChange={e => setEntryDate(e.target.value)} />
        </Field>
        {destinations.length > 1 ? (
          <Field label="Send to" required>
            <select className={ui.input} value={destType} onChange={e => setDestType(e.target.value)}>
              {destinations.map(d => <option key={d} value={d}>{DESTINATION_LABEL[d]}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="From">
            <input className={ui.input} value={store.name} readOnly />
          </Field>
        )}
      </div>

      <div className={ui.formRow2}>
        {destType === 'store' && (
          <Field label="Destination store" required>
            <select className={ui.input} value={targetStoreId} onChange={e => setTargetStoreId(e.target.value)}>
              <option value="">Choose a store…</option>
              {allStores.filter(s => s.id !== store.id).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.categoryName})</option>
              ))}
            </select>
          </Field>
        )}

        {needsOwner && (
          <Field label="Stock owner" required hint="Who this stock belongs to in the destination store" asLabel={false}>
            <select className={ui.input} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">Choose the owner…</option>
              <option value={NO_OWNER}>No owner</option>
              {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value={NEW_OWNER}>+ New owner…</option>
            </select>
            {ownerId === NEW_OWNER && (
              <input autoFocus className={ui.input} value={newOwnerName} onChange={e => setNewOwnerName(e.target.value)} placeholder="Owner's name" />
            )}
          </Field>
        )}

        {destType === 'project' && (
          <Field label="Project" required asLabel={false}>
            <select className={ui.input} value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">Choose a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.location ? ` (${p.location})` : ''}</option>)}
              <option value={NEW_PROJECT}>+ New project…</option>
            </select>
            {projectId === NEW_PROJECT && (
              <div className={ui.formRow2}>
                <input autoFocus className={ui.input} value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} placeholder="Project name" />
                <input className={ui.input} value={newProject.location} onChange={e => setNewProject(p => ({ ...p, location: e.target.value }))} placeholder="Site / location (optional)" />
              </div>
            )}
          </Field>
        )}

        {destType === 'external' && (
          <Field label="Recipient" required asLabel={false}>
            <select className={ui.input} value={recipientId} onChange={e => setRecipientId(e.target.value)}>
              <option value="">Choose a recipient…</option>
              {recipients.map(r => <option key={r.id} value={r.id}>{r.name}{r.company ? ` (${r.company})` : ''}</option>)}
              <option value={NEW_RECIPIENT}>+ New recipient…</option>
            </select>
            {recipientId === NEW_RECIPIENT && (
              <div className={ui.formRow2}>
                <input autoFocus className={ui.input} value={newRecipient.name} onChange={e => setNewRecipient(r => ({ ...r, name: e.target.value }))} placeholder="Recipient name" />
                <input className={ui.input} value={newRecipient.company} onChange={e => setNewRecipient(r => ({ ...r, company: e.target.value }))} placeholder="Company (optional)" />
              </div>
            )}
          </Field>
        )}

        {needsTaker && (
          <Field label="Taken by" required hint="The person collecting the stock for the project">
            <input className={ui.input} list="stock-out-takers" value={takenBy} onChange={e => setTakenBy(e.target.value)} placeholder="Full name" />
            <datalist id="stock-out-takers">
              {takers.map(name => <option key={name} value={name} />)}
            </datalist>
          </Field>
        )}
      </div>

      <div className={ui.formRow2}>
        <Field label={destType === 'store' ? 'Dispatched by' : 'Issued by'} hint="Optional. Printed on the note; leave empty to write it by hand.">
          <input className={ui.input} list="stock-move-people" value={issuedBy} onChange={e => setIssuedBy(e.target.value)} placeholder="Storekeeper's name" autoComplete="off" />
        </Field>
        {!needsTaker && (
          <Field label="Received by" hint={destType === 'store' ? 'Optional. Who receives it at the destination store.' : 'Optional. Who receives it for the external party.'}>
            <input className={ui.input} list="stock-move-people" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} placeholder="Full name" autoComplete="off" />
          </Field>
        )}
        <datalist id="stock-move-people">
          {people.map(name => <option key={name} value={name} />)}
        </datalist>
      </div>

      {refExists ? (
        <div className={`${ui.alert} ${ui.alertInfo}`}>
          <IconInfoCircle size={17} />
          <span>Ref no. <strong>{refNo.trim()}</strong> already has entries. These items will be added to it.</span>
        </div>
      ) : (
        <p className={ui.hint}>
          {needsTaker
            ? 'The ref no., date, destination and taken by apply to every item below.'
            : 'The ref no., date and destination apply to every item below.'}
        </p>
      )}

      <div className={ui.stack}>
        <span className={ui.sectionLabel}>Items</span>
        <div className={`${ui.card} ${ui.cardFlush}`}>
          <div className={ui.tableWrap}>
            <table className={`${ui.table} ${ui.tableCompact}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th className={ui.num}>Qty</th>
                  <th className={ui.num}>Rate (UGX)</th>
                  <th className={ui.num}>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const item = itemsById[l.entryId]
                  return (
                    <tr key={l.key}>
                      <td className={ui.cellMuted}>{i + 1}</td>
                      <td style={{ minWidth: 280 }}>
                        <select
                          className={`${ui.input} ${ui.inputSm}`}
                          value={l.entryId}
                          onChange={e => setLine(l.key, 'entryId', e.target.value)}
                          aria-label={`Line ${i + 1} item`}
                        >
                          <option value="">{choices.length ? 'Choose an item…' : 'No stock in this store can go there'}</option>
                          {choices.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}
                          {item && !choices.includes(item) && <option value={item.id}>{itemLabel(item)} (not allowed there)</option>}
                        </select>
                      </td>
                      <td style={{ minWidth: 100 }}>
                        <input
                          type="number" min="0" max={item?.quantity} inputMode="decimal" placeholder="0"
                          className={`${ui.input} ${ui.inputSm} ${ui.inputNum}`}
                          value={l.quantity} onChange={e => setLine(l.key, 'quantity', e.target.value)}
                          disabled={!item} aria-label={`Line ${i + 1} quantity`}
                        />
                      </td>
                      <td className={ui.num}>{item ? fmtNum(item.rate) : '—'}</td>
                      <td className={ui.num}>{fmtNum((item?.rate ?? 0) * (parseFloat(l.quantity) || 0))}</td>
                      <td>
                        <button type="button" className={`${ui.iconBtn} ${ui.iconBtnDanger}`} title="Remove line" onClick={() => removeLine(l.key)} disabled={lines.length === 1}>
                          <IconX size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className={ui.rowBetween}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`} onClick={() => setLines(ls => [...ls, blankLine()])}>
            <IconPlus size={15} /> Add item
          </button>
          <span className={ui.strong}>Total {fmtMoney(total)}</span>
        </div>
      </div>

      <div className={`${ui.alert} ${ui.alertNeutral}`}>
        <IconInfoCircle size={17} />
        <span>{note}</span>
      </div>

      {openingBalance && (
        <div className={`${ui.alert} ${ui.alertWarning}`}>
          <IconAlertTriangle size={17} />
          {needsOwner ? (
            <span>
              The owner can&apos;t be changed after saving. If it&apos;s wrong, delete the issue note in Documents and issue the
              stock again. Stock shared by several owners is issued once per owner, each with that owner&apos;s quantity.
            </span>
          ) : (
            <span>
              Opening stock issued straight to a project or an external party is recorded with no owner. To record whose
              it is, issue it to a store first and choose the owner there.
            </span>
          )}
        </div>
      )}

      {saved && (
        <div className={`${ui.alert} ${ui.alertSuccess}`}>
          <IconCircleCheck size={17} />
          <span>{saved}</span>
        </div>
      )}
      {error && (
        <div className={`${ui.alert} ${ui.alertDanger}`}>
          <IconAlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}
