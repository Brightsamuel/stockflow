'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

// Whether a ref no. is already in use, checked as the user types
export function useRefExists(refNo) {
  const [existing, setExisting] = useState(null)
  const ref = refNo.trim()

  useEffect(() => {
    if (!ref) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => {
      api(`/api/receipts?q=${encodeURIComponent(ref)}`, { signal: controller.signal })
        .then(data => setExisting(Array.isArray(data) && data.some(r => r.refNo === ref) ? ref : null))
        .catch(() => {})
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [ref])

  return ref !== '' && existing === ref
}

// Saves a stock in or stock movement. When the server says it repeats one saved moments ago
// (same store, destination and lines), asks before saving it a second time. Returns the
// response, or null when the user decided not to save it again.
export async function postMovement(url, body, confirm) {
  try {
    return await api(url, { method: 'POST', body })
  } catch (e) {
    if (!e.data?.duplicate) throw e
    const again = await confirm({
      title: 'Already saved?',
      message: `${e.message}\n\nSave it again anyway?`,
      confirmLabel: 'Save again',
      cancelLabel: "Don't save",
      danger: true,
    })
    if (!again) return null
    return api(url, { method: 'POST', body: { ...body, confirmDuplicate: true } })
  }
}

// Scrolls the form to the bottom whenever a line is added, so the new line is in view
export function useScrollOnAdd(count) {
  const ref = useRef(null)
  const previous = useRef(count)
  useEffect(() => {
    if (count > previous.current) ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
    previous.current = count
  }, [count])
  return ref
}

// Loads a list (owners, projects, recipients, …) once when `enabled`
export function useList(url, enabled = true) {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!enabled) return
    api(url)
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true))
  }, [url, enabled])
  return [items, setItems, loaded]
}

let lineKey = 0
export function nextLineKey() {
  lineKey += 1
  return lineKey
}
