import { useCallback, useEffect, useState } from 'react'
import { api, fmt } from '../api'
import { useAuth } from '../auth'
import { TopBar } from '../components/AppShell'
import { Alert, Confirm, Modal } from '../components/ui'
import { RetryIcon, SearchIcon } from '../components/Icons'
import { SERIES, UsageChart } from './Usage'

const TABS = [['overview', 'Overview'], ['users', 'Users'], ['activity', 'Activity'], ['system', 'System']]
const utc = (d) => (d ? new Date(String(d).endsWith('Z') ? d : d + 'Z') : null)

function ago(d) {
  const t = utc(d)
  if (!t) return 'never'
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return t.toLocaleDateString()
}
const short = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : fmt(n))

function Stat({ label, value, note }) {
  return (
    <div className="card min-w-0 p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-1 truncate text-xs text-ink-3">{note}</div>}
    </div>
  )
}

function Badge({ children, tone = 'muted' }) {
  const cls = { muted: 'bg-raised text-ink-2', accent: 'bg-accent/15 text-accent', danger: 'bg-danger-bg text-danger', ok: 'bg-[#3fb950]/15 text-[#3fb950]' }[tone]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

function ServingBadge({ serving }) {
  if (serving === 'gpu') return <Badge tone="ok">● GPU box</Badge>
  if (serving === 'openrouter') return <Badge tone="accent">● OpenRouter</Badge>
  return <Badge tone="danger">○ Offline</Badge>
}

function Section({ title, right, children, className = '' }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>{right}
      </div>
      {children}
    </section>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-ink-2">
      {SERIES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
    </div>
  )
}

/* ---------- Overview ---------- */
function Overview({ stats, system, openUser }) {
  if (!stats) return <p className="text-ink-3">Loading…</p>
  const signups30 = stats.daily.reduce((a, d) => a + d.signups, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="card min-w-0 p-4">
          <div className="text-xs text-ink-3">AI model</div>
          <div className="mt-2"><ServingBadge serving={system?.serving} /></div>
          <div className="mt-2 truncate text-xs text-ink-3">{system ? (system.serving === 'openrouter' ? 'GPU box offline, free models' : system.serving === 'gpu' ? 'Your own GPU' : 'Nothing reachable') : '…'}</div>
        </div>
        <Stat label="Users" value={fmt(stats.users)} note={`${stats.pro_users} Pro · ${stats.banned_users} banned`} />
        <Stat label="Active users" value={fmt(stats.active_users_24h)} note={`today · ${stats.active_users_7d} this week`} />
        <Stat label="Sign-ups" value={fmt(stats.signups_24h)} note={`today · ${stats.signups_7d} this week`} />
        <Stat label="Tokens today" value={short(stats.tokens_24h)} note={`${fmt(stats.requests_24h)} requests`} />
        <Stat label="Tokens this week" value={short(stats.tokens_7d)} note={`${short(stats.web_tokens_7d)} web · ${short(stats.api_tokens_7d)} API`} />
      </div>
      <Section title="Tokens per day (last 30 days)" right={<Legend />}>
        <UsageChart data={stats.daily} />
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Top users this week">
          {stats.top_users_7d.length === 0 ? <p className="text-sm text-ink-3">No usage yet this week.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-3"><tr><th className="pb-2 font-normal">User</th><th className="pb-2 pr-4 text-right font-normal">Requests</th><th className="pb-2 text-right font-normal">Tokens</th></tr></thead>
              <tbody>{stats.top_users_7d.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="w-full max-w-0 py-2 pr-3"><button onClick={() => openUser(u.id)} className="block w-full truncate text-left hover:text-accent">{u.email}</button></td>
                  <td className="py-2 pr-4 text-right tabular-nums text-ink-2">{fmt(u.requests)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(u.tokens)}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="Totals">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[['Tokens (30 days)', fmt(stats.tokens_30d)], ['Sign-ups (30 days)', fmt(signups30)], ['Chats', fmt(stats.conversations)],
              ['Messages', fmt(stats.messages)], ['Active API keys', fmt(stats.active_keys)], ['Pro users', fmt(stats.pro_users)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-line pb-2"><dt className="text-ink-3">{k}</dt><dd className="tabular-nums">{v}</dd></div>
            ))}
          </dl>
        </Section>
      </div>
    </div>
  )
}

/* ---------- Users ---------- */
const SORTS = [['created_at', 'Newest'], ['last_active', 'Last active'], ['tokens_24h', 'Tokens today'], ['tokens_7d', 'Tokens this week'], ['tokens_total', 'Tokens all time']]

function Users({ openUser, refreshKey }) {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('created_at')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  useEffect(() => {
    const t = setTimeout(() => api(`/api/admin/users?q=${encodeURIComponent(q)}`).then(setRows).catch((e) => setError(e.message)), 200)
    return () => clearTimeout(t)
  }, [q, refreshKey])
  const shown = (rows || [])
    .filter((u) => filter === 'all' || (filter === 'pro' && u.plan === 'pro') || (filter === 'free' && u.plan === 'free') || (filter === 'banned' && u.is_banned) || (filter === 'admin' && u.is_admin))
    .sort((a, b) => (sort === 'created_at' || sort === 'last_active'
      ? String(b[sort] || '').localeCompare(String(a[sort] || '')) : b[sort] - a[sort]))
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-line px-3 py-2 focus-within:border-accent">
          <SearchIcon size={16} className="text-ink-3" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" placeholder="Search by email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter users" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <option value="all">All users</option><option value="free">Free</option><option value="pro">Pro</option><option value="banned">Banned</option><option value="admin">Admins</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort users" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}
        </select>
      </div>
      {error && <div className="p-3"><Alert>{error}</Alert></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="text-xs text-ink-3"><tr className="border-b border-line">
            <th className="px-4 py-2.5 font-normal">User</th><th className="font-normal">Plan</th><th className="text-right font-normal">Today</th>
            <th className="text-right font-normal">This week</th><th className="text-right font-normal">All time</th><th className="pl-6 font-normal">Chats</th>
            <th className="font-normal">Last active</th><th className="pr-4 font-normal">Joined</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={8} className="px-4 py-6 text-ink-3">Loading…</td></tr>}
            {rows && shown.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-ink-3">No users match.</td></tr>}
            {shown.map((u) => (
              <tr key={u.id} onClick={() => openUser(u.id)} className="cursor-pointer border-b border-line last:border-0 hover:bg-hover">
                <td className="max-w-[18rem] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{u.email}</span>
                    {u.is_admin && <Badge>admin</Badge>}{u.is_banned && <Badge tone="danger">banned</Badge>}
                  </div>
                </td>
                <td>{u.plan === 'pro' ? <Badge tone="accent">Pro</Badge> : <Badge>Free</Badge>}</td>
                <td className="text-right tabular-nums">{short(u.tokens_24h)}</td>
                <td className="text-right tabular-nums">{short(u.tokens_7d)}</td>
                <td className="text-right tabular-nums text-ink-2">{short(u.tokens_total)}</td>
                <td className="pl-6 tabular-nums text-ink-2">{u.conversations}{u.api_keys > 0 && <span className="text-ink-3"> · {u.api_keys} key{u.api_keys > 1 ? 's' : ''}</span>}</td>
                <td className="text-ink-2">{ago(u.last_active)}</td>
                <td className="pr-4 text-ink-3">{utc(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows && <div className="border-t border-line px-4 py-2 text-xs text-ink-3">{shown.length} of {rows.length} users</div>}
    </div>
  )
}

function UserDrawer({ id, onClose, onChanged }) {
  const { user: me } = useAuth()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [ask, setAsk] = useState(null)
  const [temp, setTemp] = useState('')
  const load = useCallback(() => { if (id) api(`/api/admin/users/${id}`).then(setD).catch((e) => setError(e.message)) }, [id])
  useEffect(() => { setD(null); setError(''); setTemp(''); load() }, [load])
  const act = async (path, method = 'POST', body) => {
    setError('')
    try { const r = await api(`/api/admin/users/${id}${path}`, { method, body }); load(); onChanged(); return r } catch (e) { setError(e.message) }
  }
  const self = d && d.id === me?.id
  const actions = d && [
    !self && { label: d.is_banned ? 'Unban' : 'Ban', danger: !d.is_banned, title: d.is_banned ? `Unban ${d.email}?` : `Ban ${d.email}?`,
      body: d.is_banned ? 'They will be able to log in again.' : 'They will be logged out and can no longer log in or use the API.',
      run: () => act('', 'PATCH', { is_banned: !d.is_banned }) },
    !self && { label: 'Log out everywhere', title: 'Log out everywhere?', body: 'Ends all of their login sessions on every device.', run: () => act('/logout') },
    { label: 'Revoke all API keys', danger: true, title: 'Revoke all API keys?', body: 'Apps using their keys will stop working immediately.', run: () => act('/revoke-keys') },
    !self && { label: 'Reset password', title: 'Reset password?', body: 'Sets a new random password and logs them out. You will see the new password once, so you can send it to them.',
      run: async () => { const r = await act('/reset-password'); if (r) setTemp(r.temporary_password) } },
  ].filter(Boolean)

  return (
    <Modal open={!!id} onClose={onClose} title={d?.email || 'User'} className="max-w-3xl">
      <div className="max-h-[78vh] space-y-5 overflow-y-auto p-5">
        {error && <Alert>{error}</Alert>}
        {!d ? <p className="text-ink-3">Loading…</p> : (<>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {d.plan === 'pro' ? <Badge tone="accent">Pro</Badge> : <Badge>Free</Badge>}
            {d.is_admin && <Badge>admin</Badge>}{d.is_banned && <Badge tone="danger">banned</Badge>}
            <span className="text-ink-3">Joined {utc(d.created_at).toLocaleString()} · last active {ago(d.last_active)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Tokens today" value={short(d.tokens_today)} note={`of ${short(d.tokens_per_day)} per day`} />
            <Stat label="This week" value={short(d.tokens_7d)} />
            <Stat label="All time" value={short(d.tokens_total)} note={`${fmt(d.requests_total)} requests`} />
            <Stat label="Chats" value={fmt(d.conversations)} note={`${fmt(d.messages)} messages · ${d.sessions} login${d.sessions === 1 ? '' : 's'}`} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Last 30 days</h3><Legend /></div>
            <UsageChart data={d.daily} />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <label className="mr-2 flex items-center gap-2 text-sm">Plan
              <select value={d.plan} onChange={(e) => act('', 'PATCH', { plan: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1.5">
                <option value="free">Free</option><option value="pro">Pro</option>
              </select>
            </label>
            {actions.map((a) => <button key={a.label} className={`btn ${a.danger ? 'btn-danger' : 'btn-ghost'} py-1.5`} onClick={() => setAsk(a)}>{a.label}</button>)}
          </div>
          {temp && (
            <div className="rounded-xl border border-accent p-3 text-sm">
              New password for {d.email} (shown only now): <code className="ml-1 rounded bg-raised px-2 py-0.5 font-mono">{temp}</code>
              <button className="ml-2 text-accent hover:underline" onClick={() => navigator.clipboard.writeText(temp)}>Copy</button>
            </div>
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold">API keys</h3>
            {d.api_keys.length === 0 ? <p className="text-sm text-ink-3">No API keys.</p> : (
              <table className="w-full text-left text-sm">
                <tbody>{d.api_keys.map((k) => (
                  <tr key={k.id} className="border-t border-line">
                    <td className="py-2">{k.name}</td><td className="font-mono text-xs text-ink-3">{k.prefix}…</td>
                    <td className="text-ink-3">used {ago(k.last_used_at)}</td>
                    <td className="text-right">{k.revoked ? <Badge tone="danger">revoked</Badge> : <Badge tone="ok">active</Badge>}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </div>
        </>)}
      </div>
      <Confirm open={!!ask} onClose={() => setAsk(null)} title={ask?.title} body={ask?.body} action={ask?.label} onConfirm={() => ask.run()} />
    </Modal>
  )
}

/* ---------- Activity ---------- */
function Activity({ openUser, refreshKey }) {
  const [a, setA] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api('/api/admin/activity?limit=100').then(setA).catch((e) => setError(e.message)) }, [refreshKey])
  if (error) return <Alert>{error}</Alert>
  if (!a) return <p className="text-ink-3">Loading…</p>
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Section title="Latest requests">
        {a.requests.length === 0 ? <p className="text-sm text-ink-3">No requests yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-xs text-ink-3"><tr><th className="pb-2 font-normal">When</th><th className="pb-2 font-normal">User</th><th className="pb-2 font-normal">Where</th><th className="pb-2 text-right font-normal">In</th><th className="pb-2 text-right font-normal">Out</th></tr></thead>
              <tbody>{a.requests.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2 whitespace-nowrap text-ink-3" title={utc(r.created_at).toLocaleString()}>{ago(r.created_at)}</td>
                  <td className="max-w-[14rem] py-2"><button onClick={() => openUser(r.user_id)} className="block w-full truncate text-left hover:text-accent">{r.email}</button></td>
                  <td className="py-2">{r.source === 'api' ? <Badge tone="accent">API{r.key_name ? ` · ${r.key_name}` : ''}</Badge> : <Badge>Website</Badge>}</td>
                  <td className="py-2 text-right tabular-nums text-ink-2">{fmt(r.prompt_tokens)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(r.completion_tokens)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title="Newest sign-ups">
        <ul className="space-y-2 text-sm">{a.signups.map((u) => (
          <li key={u.id} className="flex justify-between gap-3 border-t border-line pt-2 first:border-0 first:pt-0">
            <button onClick={() => openUser(u.id)} className="truncate text-left hover:text-accent">{u.email}</button>
            <span className="shrink-0 text-ink-3">{ago(u.created_at)}</span>
          </li>))}
        </ul>
      </Section>
    </div>
  )
}

/* ---------- System ---------- */
function System({ system }) {
  if (!system) return <p className="text-ink-3">Loading…</p>
  const or = system.openrouter
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="AI model" right={<ServingBadge serving={system.serving} />}>
        <dl className="space-y-2.5 text-sm">
          {[['Users see', system.public_model],
            ['GPU box', system.gpu_online ? `Online (${system.gpu_model})` : 'Offline'],
            ['Backup (OpenRouter)', system.fallback_ready ? 'Ready' : 'Not set up'],
            ...system.fallback_models.map((m, i) => [i === 0 ? 'Backup model 1' : `Backup model ${i + 1}`, m]),
            ...(or ? [['OpenRouter spending', `$${(or.usage_usd ?? 0).toFixed(2)} used${or.limit_usd != null ? ` · limit $${or.limit_usd}` : ''}`]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line pb-2"><dt className="shrink-0 text-ink-3">{k}</dt><dd className="truncate text-right font-mono text-[0.8rem]">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-3">When the GPU box is online it is always used first. The backup only answers while the box is offline.</p>
      </Section>
      <Section title="Site">
        <dl className="space-y-2.5 text-sm">
          {[['Name', `${system.app_name} by ${system.company_name}`], ['New sign-ups', system.signups_open ? 'Open' : 'Closed']].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line pb-2"><dt className="text-ink-3">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Section>
      <Section title="Plans and limits" className="lg:col-span-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs text-ink-3"><tr><th className="pb-2 font-normal">Plan</th><th className="pb-2 text-right font-normal">Price</th><th className="pb-2 text-right font-normal">Tokens / day</th><th className="pb-2 text-right font-normal">Requests / min</th><th className="pb-2 text-right font-normal">Chat memory</th><th className="pb-2 text-right font-normal">Max answer</th><th className="pb-2 text-right font-normal">At once</th></tr></thead>
            <tbody>{system.plans.map((p) => (
              <tr key={p.name} className="border-t border-line">
                <td className="py-2 font-medium">{p.label}</td><td className="text-right">${p.price_usd}/mo</td>
                <td className="text-right tabular-nums">{fmt(p.tokens_per_day)}</td><td className="text-right tabular-nums">{p.requests_per_minute}</td>
                <td className="text-right tabular-nums">{fmt(p.max_context_tokens)}</td><td className="text-right tabular-nums">{fmt(p.max_output_tokens)}</td>
                <td className="text-right tabular-nums">{p.max_concurrent}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">Plans are set in api/app/config.py. Change a user's plan in the Users tab.</p>
      </Section>
    </div>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [system, setSystem] = useState(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(() => {
    setError(''); setLoading(true)
    Promise.all([
      api('/api/admin/stats').then(setStats),
      api('/api/admin/system').then(setSystem),
    ]).catch((e) => setError(e.message)).finally(() => setLoading(false))
    setRefreshKey((k) => k + 1)
  }, [])
  useEffect(() => { refresh() }, [refresh])

  return (
    <>
      <TopBar title="Admin">
        <button onClick={refresh} className="icon-btn ml-auto mr-1" aria-label="Refresh" title="Refresh">
          <RetryIcon size={17} className={loading ? 'animate-spin' : ''} />
        </button>
      </TopBar>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 pb-12">
          <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Admin sections">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-current={tab === k}
                      className={`-mb-px border-b-2 px-3 py-2.5 text-sm ${tab === k ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>{l}</button>
            ))}
          </nav>
          {error && <div className="mb-4"><Alert>{error}</Alert></div>}
          {tab === 'overview' && <Overview stats={stats} system={system} openUser={setOpenId} />}
          {tab === 'users' && <Users openUser={setOpenId} refreshKey={refreshKey} />}
          {tab === 'activity' && <Activity openUser={setOpenId} refreshKey={refreshKey} />}
          {tab === 'system' && <System system={system} />}
        </div>
      </div>
      <UserDrawer id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </>
  )
}
