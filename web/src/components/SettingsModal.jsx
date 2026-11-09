import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmt } from '../api'
import { useAuth } from '../auth'
import { useTheme } from '../theme'
import { useShell } from './AppShell'
import { Alert, Confirm, Modal } from './ui'
import { DatabaseIcon, GearIcon, MoonIcon, SunIcon, UserIcon, XIcon } from './Icons'

const TABS = [['general', 'General', GearIcon], ['account', 'Account', UserIcon], ['data', 'Data controls', DatabaseIcon]]

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

function Account({ onClose }) {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <>
      <Row label="Email"><span className="text-sm text-ink-2">{user?.email}</span></Row>
      <Row label={`${user?.plan.label} plan`} hint={`${fmt(user?.plan.tokens_per_day)} tokens a day · ${fmt(user?.plan.max_context_tokens)} tokens of chat memory`}>
        <button className="btn btn-ghost" onClick={() => { onClose(); nav('/usage') }}>View usage</button>
      </Row>
      <div className="border-b border-line"><ChangePassword /></div>
      <Row label="Log out on this device">
        <button className="btn btn-ghost" onClick={async () => { onClose(); await logout(); nav('/') }}>Log out</button>
      </Row>
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
      <Row label="Delete all chats" hint={`${convs.length} chat${convs.length === 1 ? '' : 's'}`}>
        <button className="btn btn-danger" disabled={!convs.length} onClick={() => setAsk(true)}>Delete all</button>
      </Row>
      <Confirm open={ask} onClose={() => setAsk(false)} title="Delete all chats?" action="Delete all"
               body="Every chat will be deleted. You can't undo this." onConfirm={deleteAll} />
    </>
  )
}

export default function SettingsModal({ open, onClose }) {
  const [tab, setTab] = useState('general')
  const Body = { general: General, account: Account, data: Data }[tab]
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
