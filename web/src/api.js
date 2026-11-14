export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(path, {
    method, signal, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.detail || data.error?.message || `Request failed (${res.status})`)
  return data
}

// Reads our chat SSE stream ("data: {...}" lines) and calls onEvent for each event.
export async function streamChat(convId, payload, onEvent, signal) {
  const res = await fetch(`/api/conversations/${convId}/messages`, {
    method: 'POST', signal, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, data.detail || `Request failed (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2)
      for (const line of block.split('\n')) {
        if (line.startsWith('data:')) {
          try { onEvent(JSON.parse(line.slice(5))) } catch { /* ignore partial */ }
        }
      }
    }
  }
}

export const fmt = (n) => (n ?? 0).toLocaleString()
// Dollars: cents for amounts from $1 up, more digits below so small use still shows.
export const usd = (n) => {
  const v = n ?? 0
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: v >= 1 || v === 0 ? 2 : 4 })
}
// "about 10M tokens" for a dollar amount at a price per million.
export const tokensFor = (dollars, perMillion) => {
  const t = (dollars / perMillion) * 1e6
  return t >= 1e6 ? `${+(t / 1e6).toFixed(1)}M` : `${Math.round(t / 1e3)}k`
}
