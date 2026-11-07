import { useEffect, useState } from 'react'
import { api, fmt } from '../api'

function Stat({ label, value }) {
  return <div className="card p-4"><div className="text-xs text-ink-3">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>
}

export default function Admin() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const load = () => {
    api('/api/admin/stats').then(setStats).catch((e) => setError(e.message))
    api(`/api/admin/users?q=${encodeURIComponent(q)}`).then(setUsers).catch((e) => setError(e.message))
  }
  useEffect(() => { load() }, [q]) // eslint-disable-line
  const patch = async (u, body) => {
    try { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body }); load() } catch (e) { setError(e.message) }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold">Admin</h1>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      {stats && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Model server" value={stats.model_online ? <span className="text-green-400">● Online</span> : <span className="text-red-300">○ Offline</span>} />
          <Stat label="Users" value={fmt(stats.users)} />
          <Stat label="Sign-ups (24h)" value={fmt(stats.signups_24h)} />
          <Stat label="Requests (24h)" value={fmt(stats.requests_24h)} />
          <Stat label="Tokens (24h)" value={fmt(stats.tokens_24h)} />
          <Stat label="Active API keys" value={fmt(stats.active_keys)} />
        </div>
      )}
      <div className="card mt-6 overflow-x-auto">
        <div className="p-3"><input className="input max-w-xs" placeholder="Search email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" /></div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-3"><tr>
            <th className="p-3">Email</th><th>Plan</th><th>Tokens (24h)</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="p-3">{u.email}{u.is_admin && <span className="ml-2 rounded bg-[#262624] px-1.5 text-xs">admin</span>}</td>
                <td><select value={u.plan} onChange={(e) => patch(u, { plan: e.target.value })} aria-label={`Plan for ${u.email}`}
                            className="rounded border border-line bg-surface px-2 py-1"><option value="free">free</option><option value="pro">pro</option></select></td>
                <td>{fmt(u.tokens_24h)}</td>
                <td className="text-ink-3">{new Date(u.created_at + 'Z').toLocaleDateString()}</td>
                <td>{u.is_banned ? <span className="text-red-300">Banned</span> : 'Active'}</td>
                <td className="pr-3 text-right">
                  {!u.is_admin && <button className="btn btn-ghost py-1" onClick={() => patch(u, { is_banned: !u.is_banned })}>{u.is_banned ? 'Unban' : 'Ban'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
