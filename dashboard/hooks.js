'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

// Whether a ref no. is already in use, checked as the user types
export function useRefExists(refNo) {
  const [existing, setExisting] = useState(null)
  const ref = refNo.trim()

  useEffect(() => {
    if (!ref) return undefined
    const timer = setTimeout(() => {
      api(`/api/receipts?q=${encodeURIComponent(ref)}`)
        .then(data => setExisting(Array.isArray(data) && data.some(r => r.refNo === ref) ? ref : null))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [ref])

  return ref !== '' && existing === ref
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
