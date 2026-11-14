import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { TopBar } from '../components/AppShell'

const when = (d) => (d ? new Date(d + 'Z').toLocaleString() : 'never')

export default function Keys() {
  const [keys, setKeys] = useState([])
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState(null)
  const [error, setError] = useState('')
  const load = () => api('/api/keys').then(setKeys).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  async function create(e) {
    e.preventDefault(); setError('')
    try {
      const k = await api('/api/keys', { method: 'POST', body: { name: name || 'My key' } })
      setFresh(k.key); setName(''); load()
    } catch (err) { setError(err.message) }
  }
  async function revoke(k) {
    if (!confirm(`Revoke "${k.name}"? Apps using it will stop working.`)) return
    await api(`/api/keys/${k.id}`, { method: 'DELETE' }); load()
  }

  return (
    <>
    <TopBar title="API keys" />
    <div className="flex-1 overflow-y-auto"><div className="mx-auto max-w-3xl px-4 pt-4 pb-10">
      <p className="mt-1 text-sm text-ink-2">Use a key to call the API from your own apps. See the <Link to="/docs" className="text-accent underline">docs</Link>.</p>
      <form onSubmit={create} className="mt-6 flex gap-2">
        <input className="input" placeholder="Key name, e.g. my-app" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} aria-label="Key name" />
        <button className="btn btn-primary shrink-0 rounded-xl">Create key</button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {fresh && (
        <div className="card mt-4 border-accent p-4">
          <p className="text-sm font-semibold">Copy your new key now. You won't see it again.</p>
          <div className="mt-2 flex gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-surface px-3 py-2 text-sm">{fresh}</code>
            <button className="btn btn-ghost" onClick={() => navigator.clipboard.writeText(fresh)}>Copy</button>
          </div>
          <p className="mt-3 text-sm text-ink-2">
            Use it in your own code, or in <a href="/#xari-bulbul" className="text-accent underline">Xarı Bülbül</a>, our desktop coding agent:
            paste it in Settings → Providers → Samanyolu AI Synapse.
          </p>
          <button className="mt-2 text-xs text-ink-3 underline" onClick={() => setFresh(null)}>I've saved it</button>
        </div>
      )}
      <div className="card mt-6 divide-y divide-line">
        {keys.length === 0 && <p className="p-4 text-sm text-ink-3">No keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-medium">{k.name}</div>
              <div className="text-xs text-ink-3"><code>{k.prefix}…</code> · created {when(k.created_at)} · last used {when(k.last_used_at)}</div>
            </div>
            <button className="btn btn-ghost text-danger" onClick={() => revoke(k)}>Revoke</button>
          </div>
        ))}
      </div>
    </div></div>
    </>
  )
}
