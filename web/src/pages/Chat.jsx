import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fmt, streamChat } from '../api'
import { useAuth } from '../auth'
import Markdown from '../components/Markdown'
import { Logo } from '../components/Layout'

function Thinking({ text, live }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="mb-2">
      <button onClick={() => setOpen(!open)} className="text-xs text-ink-3 hover:text-ink-2">
        {live ? '● Thinking…' : 'Thought process'} {open ? '▾' : '▸'}
      </button>
      {open && <div className="mt-1 whitespace-pre-wrap border-l-2 border-line pl-3 text-sm text-ink-3">{text}</div>}
    </div>
  )
}

function Sidebar({ convs, activeId, onNew, onDelete, open, setOpen }) {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <aside className={`${open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-20 w-72 flex-col border-r border-line bg-panel md:static md:flex`}>
      <div className="flex items-center justify-between p-3"><Logo />
        <button className="text-ink-3 md:hidden" onClick={() => setOpen(false)} aria-label="Close sidebar">✕</button></div>
      <div className="px-3"><button className="btn btn-primary w-full" onClick={onNew}>+ New chat</button></div>
      <nav className="mt-3 flex-1 overflow-y-auto px-2">
        {convs.length === 0 && <p className="px-2 text-sm text-ink-3">No chats yet.</p>}
        {convs.map((c) => (
          <div key={c.id} className={`group flex items-center rounded-md ${c.id === activeId ? 'bg-[#262624]' : 'hover:bg-[#222220]'}`}>
            <Link to={`/chat/${c.id}`} onClick={() => setOpen(false)} className="flex-1 truncate px-2 py-2 text-sm">{c.title}</Link>
            <button onClick={() => onDelete(c.id)} aria-label={`Delete ${c.title}`}
                    className="px-2 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-red-300 focus:opacity-100">🗑</button>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3 text-xs text-ink-3">
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
          <Link to="/keys" className="hover:text-ink">API keys</Link><Link to="/usage" className="hover:text-ink">Usage</Link>
          <Link to="/docs" className="hover:text-ink">Docs</Link>{user?.is_admin && <Link to="/admin" className="hover:text-ink">Admin</Link>}
        </div>
        <div className="truncate">{user?.email} · {user?.plan.label}</div>
        <div>{fmt(user?.tokens_used_today)} / {fmt(user?.plan.tokens_per_day)} tokens today</div>
        <button className="mt-2 hover:text-ink" onClick={async () => { await logout(); nav('/') }}>Log out</button>
      </div>
    </aside>
  )
}

function ContextMeter({ ctx }) {
  if (!ctx || !ctx.limit) return null
  const pct = Math.min(100, Math.round((ctx.used / ctx.limit) * 100))
  const at = Math.round(ctx.compress_at * 100)
  return (
    <div className="flex items-center gap-2 text-xs text-ink-3" title={`Older messages are summarized automatically at ${at}%`}>
      <span>Context {pct}%</span>
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-[#2c2c2a]" role="progressbar"
           aria-label="Context used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= at ? '#d95926' : '#3987e5' }} />
        <div className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${at}%` }} />
      </div>
    </div>
  )
}

export default function Chat() {
  const { id } = useParams()
  const convId = id ? Number(id) : null
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [convs, setConvs] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [effort, setEffort] = useState('medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sideOpen, setSideOpen] = useState(false)
  const [ctx, setCtx] = useState(null)
  const [status, setStatus] = useState('')
  const abortRef = useRef(null)
  const bottomRef = useRef(null)
  const pendingRef = useRef(null) // message to send right after creating a conversation

  const loadConvs = () => api('/api/conversations').then(setConvs).catch(() => {})
  const loadConv = (cid) => api(`/api/conversations/${cid}`)
    .then((c) => { setMessages(c.messages); setCtx(c.context) }).catch(() => nav('/chat'))
  useEffect(() => { loadConvs() }, [])

  useEffect(() => {
    setError('')
    if (!convId) { setMessages([]); setCtx(null); return }
    if (pendingRef.current) { const p = pendingRef.current; pendingRef.current = null; send(p, convId); return }
    loadConv(convId)
  }, [convId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [messages])

  async function send(text, targetId = convId) {
    if (!text.trim() || busy) return
    if (!targetId) {
      const c = await api('/api/conversations', { method: 'POST' })
      pendingRef.current = text
      setConvs((cs) => [c, ...cs])
      nav(`/chat/${c.id}`)
      return
    }
    setInput(''); setError(''); setBusy(true)
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '', reasoning: '', live: true }])
    const ctrl = new AbortController(); abortRef.current = ctrl
    const patch = (fn) => setMessages((m) => { const c = [...m]; c[c.length - 1] = fn({ ...c[c.length - 1] }); return c })
    try {
      await streamChat(targetId, { content: text, reasoning_effort: effort }, (ev) => {
        if (ev.t === 'r') patch((a) => ({ ...a, reasoning: a.reasoning + ev.v }))
        else if (ev.t === 'c') patch((a) => ({ ...a, content: a.content + ev.v }))
        else if (ev.t === 'error') setError(ev.v)
        else if (ev.t === 'compressing') setStatus('Compressing earlier messages to free up memory…')
        else if (ev.t === 'compressed') setStatus('')
        else if (ev.t === 'done' && ev.context) setCtx(ev.context)
        else if (ev.t === 'title') setConvs((cs) => cs.map((c) => (c.id === targetId ? { ...c, title: ev.v } : c)))
      }, ctrl.signal)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      patch((a) => ({ ...a, live: false }))
      setMessages((m) => m.filter((x) => x.role === 'user' || x.content || x.reasoning))
      setBusy(false); setStatus(''); abortRef.current = null
      refresh(); loadConvs(); loadConv(targetId)
    }
  }

  async function del(cid) {
    if (!confirm('Delete this chat?')) return
    await api(`/api/conversations/${cid}`, { method: 'DELETE' })
    setConvs((cs) => cs.filter((c) => c.id !== cid))
    if (cid === convId) nav('/chat')
  }

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) } }

  return (
    <div className="flex h-full">
      <Sidebar convs={convs} activeId={convId} onNew={() => nav('/chat')} onDelete={del} open={sideOpen} setOpen={setSideOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line px-3 py-2 md:hidden">
          <button onClick={() => setSideOpen(true)} aria-label="Open sidebar" className="text-xl">☰</button>
          <span className="truncate text-sm">{convs.find((c) => c.id === convId)?.title || 'New chat'}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 && (
              <div className="pt-24 text-center">
                <h1 className="text-3xl font-bold">What can I help with?</h1>
                <div className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
                  {['Explain how HTTPS works, simply', 'Write a Python script that renames files by date',
                    'Find the bug: for i in range(len(a)): a.remove(a[i])', 'Plan a 3-day trip to Istanbul'].map((s) => (
                    <button key={s} onClick={() => send(s)} className="card p-3 text-left text-sm text-ink-2 hover:border-accent">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={m.id ?? `live-${i}`}>
              {ctx?.summary_upto > 0 && m.id > ctx.summary_upto && !(messages[i - 1]?.id > ctx.summary_upto) && (
                <div className="my-6 flex items-center gap-3 text-xs text-ink-3">
                  <div className="h-px flex-1 bg-line" />Earlier messages above were summarized for the AI's memory<div className="h-px flex-1 bg-line" />
                </div>
              )}
              {m.role === 'user' ? (
              <div className="my-4 flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[#262624] px-4 py-2.5">{m.content}</div>
              </div>
            ) : (
              <div className="my-4">
                <Thinking text={m.reasoning} live={m.live && !m.content} />
                {m.content ? <Markdown text={m.content} /> : m.live && !m.reasoning && <span className="animate-pulse text-ink-3">●</span>}
              </div>
            )}
              </div>
            ))}
            {status && <p className="my-3 animate-pulse text-sm text-ink-3">{status}</p>}
            {error && <p role="alert" className="my-4 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</p>}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className="border-t border-line p-3">
          <div className="mx-auto max-w-3xl">
            <div className="card flex items-end gap-2 p-2">
              <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
                placeholder="Message Madness… (Shift+Enter for a new line)" aria-label="Message"
                className="max-h-60 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 outline-none"
                style={{ height: Math.min(240, 40 + (input.split('\n').length - 1) * 24) }} />
              <select value={effort} onChange={(e) => setEffort(e.target.value)} aria-label="Reasoning effort"
                      className="rounded-md border border-line bg-surface px-2 py-2 text-xs text-ink-2">
                <option value="low">Fast</option><option value="medium">Balanced</option><option value="high">Deep think</option>
              </select>
              {busy ? <button className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>Stop</button>
                    : <button className="btn btn-primary" onClick={() => send(input)} disabled={!input.trim()}>Send</button>}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <ContextMeter ctx={ctx} />
              <p className="text-xs text-ink-3">AI can make mistakes. Check important info.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
