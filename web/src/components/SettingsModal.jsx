import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmt, usd } from '../api'
import { useAuth } from '../auth'
import { useTheme } from '../theme'
import { useShell } from './AppShell'
import { Alert, Confirm, Modal } from './ui'
import { DatabaseIcon, EditIcon, GearIcon, MoonIcon, SparkIcon, SunIcon, TrashIcon, UserIcon, XIcon } from './Icons'

const TABS = [['general', 'General', GearIcon], ['memory', 'Memory', SparkIcon], ['account', 'Account', UserIcon], ['data', 'Data controls', DatabaseIcon]]

function Row({ label, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-0">
      <div className="min-w-0"><div className="text-sm">{label}</div>{hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function General() {
  const [theme, setTheme] = useTheme()
  const opt = (t, Icon, label) => (
    <button onClick={() => setTheme(t)} aria-pressed={theme === t}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${theme === t ? 'bg-raised text-ink' : 'text-ink-2 hover:text-ink'}`}>
      <Icon size={15} />{label}
    </button>
  )
  return (
    <>
      <Row label="Theme"><div className="flex rounded-full border border-line p-0.5">{opt('dark', MoonIcon, 'Dark')}{opt('light', SunIcon, 'Light')}</div></Row>
      <Row label="Language" hint="Synapse answers in whatever language you write in."><span className="text-sm text-ink-2">Automatic</span></Row>
      <Row label="Model" hint="Pick Low, Medium or High thinking at the top of any chat."><span className="text-sm text-ink-2">Synapse-2</span></Row>
    </>
  )
}

function ChangePassword() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      await api('/api/auth/password', { method: 'POST', body: { current_password: cur, new_password: next } })
      setMsg({ ok: true, text: 'Password changed. Other devices were logged out.' }); setCur(''); setNext('')
    } catch (err) { setMsg({ ok: false, text: err.message }) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="space-y-2.5 py-3.5">
      <div className="text-sm">Change password</div>
      <input className="input" type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password"
             required value={cur} onChange={(e) => setCur(e.target.value)} />
      <input className="input" type="password" autoComplete="new-password" placeholder="New password (at least 8 characters)" aria-label="New password"
             required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
      {msg && (msg.ok ? <p role="status" className="text-sm text-accent">{msg.text}</p> : <Alert>{msg.text}</Alert>)}
      <button className="btn btn-primary" disabled={busy || !cur || next.length < 8}>{busy ? 'Saving…' : 'Update password'}</button>
    </form>
  )
}

function Switch({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-raised'}`}>
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function MemoryItem({ m, run }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(m.content)
  const save = () => {
    setEditing(false)
    if (text.trim() && text.trim() !== m.content) run(() => api(`/api/memories/${m.id}`, { method: 'PATCH', body: { content: text.trim() } }))
    else setText(m.content)
  }
  if (editing) {
    return (
      <li className="px-2 py-1.5">
        <input autoFocus className="input py-1.5 text-sm" maxLength={500} value={text} aria-label="Edit memory"
               onChange={(e) => setText(e.target.value)} onBlur={save}
               onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setText(m.content); setEditing(false) } }} />
      </li>
    )
  }
  return (
    <li className="group flex items-start gap-1 px-3.5 py-2.5 text-sm">
      <span className="flex-1">{m.content}</span>
      <button className="icon-btn -my-1 p-1 opacity-60 group-hover:opacity-100" aria-label={`Edit: ${m.content}`} title="Edit"
              onClick={() => { setText(m.content); setEditing(true) }}><EditIcon size={15} /></button>
      <button className="icon-btn -my-1 p-1 opacity-60 group-hover:opacity-100" aria-label={`Forget: ${m.content}`} title="Forget"
              onClick={() => run(() => api(`/api/memories/${m.id}`, { method: 'DELETE' }))}><TrashIcon size={15} /></button>
    </li>
  )
}

function MemoryTab() {
  const [data, setData] = useState(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [ask, setAsk] = useState(false)
  const load = () => api('/api/memories').then(setData).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  const run = async (fn) => { setError(''); try { await fn(); await load() } catch (e) { setError(e.message) } }
  if (!data) return <p className="py-4 text-sm text-ink-3">{error || 'Loading…'}</p>
  return (
    <>
      <Row label="Remember things about me" hint="Synapse saves useful facts you share, like your name, work or projects, and uses them in every chat. It never saves passwords.">
        <Switch on={data.enabled} label="Memory" onChange={(v) => run(() => api('/api/memories/settings', { method: 'PUT', body: { enabled: v } }))} />
      </Row>
      <form className="flex gap-2 py-3.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(async () => { await api('/api/memories', { method: 'POST', body: { content: text.trim() } }); setText('') }) }}>
        <input className="input py-2" maxLength={500} placeholder="Add something to remember, e.g. I prefer short answers" aria-label="New memory"
               value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary shrink-0" disabled={!text.trim()}>Add</button>
      </form>
      {error && <Alert>{error}</Alert>}
      <div className="flex items-center justify-between pt-1 pb-2">
        <div className="text-sm">Saved memories <span className="text-ink-3">({data.memories.length})</span></div>
        {data.memories.length > 0 && <button className="text-sm text-danger hover:underline" onClick={() => setAsk(true)}>Delete all</button>}
      </div>
      {data.memories.length === 0
        ? <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">Nothing saved yet. Tell Synapse about yourself in a chat, or add something above.</p>
        : (
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {data.memories.map((m) => <MemoryItem key={m.id} m={m} run={run} />)}
          </ul>
        )}
      <Confirm open={ask} onClose={() => setAsk(false)} title="Delete all memories?" action="Delete all"
               body="Synapse will forget everything it saved about you. Your chats are not deleted." onConfirm={() => run(() => api('/api/memories', { method: 'DELETE' }))} />
    </>
  )
}

function Account({ onClose }) {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <>
      <Row label="Email"><span className="text-sm text-ink-2">{user?.email}</span></Row>
      <Row label={`${user?.plan.label} plan`} hint={`${usd(user?.plan.usd_per_week)} of use a week · ${fmt(user?.plan.max_context_tokens)} tokens of chat memory`}>
        <button className="btn btn-ghost" onClick={() => { onClose(); nav('/usage') }}>View usage</button>
      </Row>
      <div className="border-b border-line"><ChangePassword /></div>
      <Row label="Log out on this device">
        <button className="btn btn-ghost" onClick={async () => { onClose(); await logout(); nav('/') }}>Log out</button>
      </Row>
    </>
  )
}

function TrainingSwitch() {
  const { user, setUser } = useAuth()
  const [error, setError] = useState('')
  const set = async (enabled) => {
    setError('')
    try { await api('/api/settings/training', { method: 'PUT', body: { enabled } }); setUser({ ...user, training_opt_in: enabled }) }
    catch (e) { setError(e.message) }
  }
  return (
    <>
      <Row label="Help improve Synapse"
           hint="Allow Samanyolu AI to use your chats to train and improve future Synapse models. Your email is never included. You can turn this off any time.">
        <Switch on={!!user?.training_opt_in} label="Help improve Synapse" onChange={set} />
      </Row>
      {error && <Alert>{error}</Alert>}
    </>
  )
}

function Data({ onClose }) {
  const { convs, setConvs } = useShell()
  const [ask, setAsk] = useState(false)
  const nav = useNavigate()
  async function deleteAll() {
    await Promise.all(convs.map((c) => api(`/api/conversations/${c.id}`, { method: 'DELETE' }).catch(() => {})))
    setConvs([]); onClose(); nav('/chat')
  }
  return (
    <>
      <TrainingSwitch />
      <Row label="Delete all chats" hint={`${convs.length} chat${convs.length === 1 ? '' : 's'}`}>
        <button className="btn btn-danger" disabled={!convs.length} onClick={() => setAsk(true)}>Delete all</button>
      </Row>
      <Confirm open={ask} onClose={() => setAsk(false)} title="Delete all chats?" action="Delete all"
               body="Every chat will be deleted. You can't undo this." onConfirm={deleteAll} />
    </>
  )
}

export default function SettingsModal({ open, onClose, initialTab = 'general' }) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => { if (open) setTab(initialTab) }, [open, initialTab])
  const Body = { general: General, memory: MemoryTab, account: Account, data: Data }[tab]
  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <div className="flex min-h-[26rem] flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 sm:w-48 sm:flex-col sm:border-r sm:border-b-0" aria-label="Settings sections">
          <button className="icon-btn mb-2 hidden self-start sm:inline-flex" onClick={onClose} aria-label="Close settings"><XIcon /></button>
          {TABS.map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)} aria-current={tab === key}
                    className={`menu-item whitespace-nowrap ${tab === key ? 'bg-hover' : ''}`}><Icon size={17} />{label}</button>
          ))}
          <button className="icon-btn ml-auto sm:hidden" onClick={onClose} aria-label="Close settings"><XIcon /></button>
        </nav>
        <section className="flex-1 overflow-y-auto px-5 py-3">
          <h2 className="border-b border-line pb-3 text-lg font-semibold">{TABS.find((t) => t[0] === tab)[1]}</h2>
          <Body onClose={onClose} />
        </section>
      </div>
    </Modal>
  )
}
