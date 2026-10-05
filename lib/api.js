// Browser-side JSON helper for the app's API routes. Returns the parsed body, throws an
// Error carrying the server's message on failure, and sends the user to sign in when the
// session has expired (except on the auth routes, where 401 means wrong credentials).
// Responses are never taken from the browser cache: stock data is always read live.
export async function api(url, { method = "GET", body, signal } = {}) {
  const res = await fetch(url, {
    method,
    signal,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)

  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    window.location.href = "/login"
    throw new Error("Your session has expired. Please sign in again.")
  }
  if (!res.ok) {
    const error = new Error(data?.error || "Something went wrong. Please try again.")
    error.status = res.status
    error.data = data
    throw error
  }
  return data
}
