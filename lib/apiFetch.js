export async function apiFetch(url, options) {
  const res = await fetch(url, options)
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  return res
}