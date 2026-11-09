import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, streamChat } from '../api'
import { useAuth } from '../auth'
import Markdown from '../components/Markdown'
import { TopBar, useShell } from '../components/AppShell'
import { Alert, Dropdown } from '../components/ui'
import { LogoMark } from '../components/Logo'
import {
  ArrowUpIcon, CheckIcon, ChevronDown, ChevronRight, CopyIcon, EditIcon, RetryIcon, StopIcon,
} from '../components/Icons'

const MODES = [
  ['low', 'Low', 'Answers right away'],
  ['medium', 'Medium', 'Thinks a little first'],
  ['high', 'High', 'Thinks longest, for hard problems'],
]

const SUGGESTIONS = [
  ['Explain', 'how HTTPS keeps my data safe, simply'],
  ['Write', 'a Python script that renames photos by date'],
  ['Debug', 'for i in range(len(a)): a.remove(a[i])'],
  ['Plan', 'a 3-day trip to Istanbul on a budget'],
]

function ModelPicker({ effort, setEffort }) {
  return (
    <Dropdown menuClass="w-72" button={({ toggle, open }) => (
      <button onClick={toggle} aria-expanded={open} aria-haspopup="menu"
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-lg font-medium hover:bg-hover">
        Synapse-2 <span className="text-ink-3">{MODES.find((m) => m[0] === effort)[1]}</span><ChevronDown size={16} className="text-ink-3" />
      </button>
    )}>
      {(close) => (<>
        <div className="px-2.5 pt-1.5 pb-1 text-xs text-ink-3">Thinking mode</div>
        {MODES.map(([key, label, hint]) => (
          <button key={key} role="menuitemradio" aria-checked={effort === key} className="menu-item"
                  onClick={() => { setEffort(key); close() }}>
            <span className="flex-1"><span className="block">{label}</span><span className="block text-xs text-ink-3">{hint}</span></span>
            {effort === key && <CheckIcon size={17} />}
          </button>
        ))}
      </>)}
    </Dropdown>
  )
}

function Thinking({ text, live, seconds }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const label = live ? 'Thinking…' : seconds ? `Thought for ${seconds}s` : 'Thought process'
  return (
    <div className="mb-3">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
              className={`flex items-center gap-1 text-sm text-ink-3 hover:text-ink-2 ${live ? 'animate-pulse' : ''}`}>
        {label}<ChevronRight size={15} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="mt-2 whitespace-pre-wrap border-l-2 border-line pl-4 text-sm leading-relaxed text-ink-3">{text}</div>}
    </div>
  )
}

function ActionButton({ label, onClick, children }) {
  return <button onClick={onClick} className="icon-btn p-1.5" aria-label={label} title={label}>{children}</button>
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }
  return <ActionButton label={done ? 'Copied' : 'Copy'} onClick={copy}>{done ? <CheckIcon size={17} /> : <CopyIcon size={17} />}</ActionButton>
}

function UserMessage({ m, canEdit, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(m.content)
  if (editing) {
    return (
      <div className="my-5 rounded-3xl bg-raised p-3">
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit message"
                  rows={Math.min(10, text.split('\n').length + 1)} className="w-full resize-none bg-transparent px-2 py-1 outline-none" />
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => { setEditing(false); setText(m.content) }}>Cancel</button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={() => { setEditing(false); onEdit(m, text) }}>Send</button>
        </div>
      </div>
    )
  }
  return (
    <div className="group my-5 flex flex-col items-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-raised px-5 py-2.5">{m.content}</div>
      <div className="mt-1 flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CopyButton text={m.content} />
        {canEdit && <ActionButton label="Edit message" onClick={() => { setText(m.content); setEditing(true) }}><EditIcon size={17} /></ActionButton>}
      </div>
    </div>
  )
}

function AssistantMessage({ m, isLast, canRegenerate, onRegenerate }) {
  return (
    <div className="group my-5">
      <Thinking text={m.reasoning} live={m.live && !m.content} seconds={m.seconds} />
      {m.content ? <Markdown text={m.content} /> : m.live && !m.reasoning && <span className="cursor-dot" aria-label="Synapse is typing" />}
      {!m.live && m.content && (
        <div className={`mt-1 -ml-1.5 flex transition-opacity ${isLast ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
          <CopyButton text={m.content} />
          {canRegenerate && <ActionButton label="Regenerate" onClick={onRegenerate}><RetryIcon size={17} /></ActionButton>}
        </div>
      )}
    </div>
  )
}

function ContextMeter({ ctx }) {
  if (!ctx || !ctx.limit) return null
  const pct = Math.min(100, Math.round((ctx.used / ctx.limit) * 100))
  const at = Math.round(ctx.compress_at * 100)
  if (pct < 25) return null // only show once it matters
  return (
    <span className="inline-flex items-center gap-1.5" title={`When memory reaches ${at}%, older messages are summarized automatically`}>
      Memory {pct}%
      <span className="relative inline-block h-1 w-14 overflow-hidden rounded-full bg-raised" role="progressbar"
            aria-label="Chat memory used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

function Composer({ value, setValue, onSend, onStop, busy, autoFocus, ctx }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }, [value])
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) onSend(value) }
  }
  return (
    <div className="w-full">
      <div className="flex items-end gap-2 rounded-[1.75rem] border border-line bg-raised p-2 pl-4 shadow-sm focus-within:border-ink-3">
        <textarea ref={ref} rows={1} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} autoFocus={autoFocus}
                  placeholder="Ask anything" aria-label="Message Synapse"
                  className="max-h-[220px] min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 leading-6 outline-none placeholder:text-ink-3" />
        {busy
          ? <button onClick={onStop} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-surface" aria-label="Stop answering"><StopIcon size={16} /></button>
          : <button onClick={() => onSend(value)} disabled={!value.trim()} aria-label="Send message"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-surface transition-opacity disabled:opacity-30"><ArrowUpIcon size={18} /></button>}
      </div>
      <div className="mt-2 flex justify-center gap-3 text-center text-xs text-ink-3">
        <span>Synapse can make mistakes. Check important info.</span>
        <ContextMeter ctx={ctx} />
      </div>
    </div>
  )
}

export default function Chat() {
  const { id } = useParams()
  const convId = id ? Number(id) : null
  const nav = useNavigate()
  const { user, refresh } = useAuth()
  const { setConvs, loadConvs } = useShell()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [effort, setEffortState] = useState(() => localStorage.getItem('synapse-effort') || 'medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ctx, setCtx] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)
  const stickRef = useRef(true) // keep scrolled to the bottom unless the user scrolls up
  const pendingRef = useRef(null) // message to send right after creating a conversation

  const setEffort = (e) => { setEffortState(e); localStorage.setItem('synapse-effort', e) }
  const loadConv = (cid) => api(`/api/conversations/${cid}`)
    .then((c) => { setMessages(c.messages); setCtx(c.context) }).catch(() => nav('/chat'))

  useEffect(() => {
    setError(''); stickRef.current = true
    if (!convId) { setMessages([]); setCtx(null); return }
    if (pendingRef.current) { const p = pendingRef.current; pendingRef.current = null; run({ content: p }, convId); return }
    setLoading(true); loadConv(convId).finally(() => setLoading(false))
  }, [convId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages, status, error])
  const onScroll = () => {
    const el = scrollRef.current
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // body: { content } | { content, edit_message_id } | { regenerate: true }
  async function run(body, targetId = convId) {
    if (busy) return
    if (!body.regenerate && !body.content?.trim()) return
    if (!targetId) {
      try {
        const c = await api('/api/conversations', { method: 'POST' })
        pendingRef.current = body.content
        setConvs((cs) => [c, ...cs]); setInput('')
        nav(`/chat/${c.id}`)
      } catch (e) { setError(e.message) }
      return
    }
    setError(''); setBusy(true); stickRef.current = true
    if (!body.regenerate && !body.edit_message_id) setInput('')
    const live = { role: 'assistant', content: '', reasoning: '', live: true }
    setMessages((m) => {
      if (body.regenerate) {
        const lastUser = m.map((x) => x.role).lastIndexOf('user')
        return [...m.slice(0, lastUser + 1), live]
      }
      const cut = body.edit_message_id ? m.findIndex((x) => x.id === body.edit_message_id) : m.length
      return [...m.slice(0, cut), { role: 'user', content: body.content }, live]
    })
    const ctrl = new AbortController(); abortRef.current = ctrl
    const patch = (fn) => setMessages((m) => { const c = [...m]; c[c.length - 1] = fn({ ...c[c.length - 1] }); return c })
    let thinkStart = null
    try {
      await streamChat(targetId, { ...body, reasoning_effort: effort }, (ev) => {
        if (ev.t === 'r') { thinkStart ??= Date.now(); patch((a) => ({ ...a, reasoning: a.reasoning + ev.v })) }
        else if (ev.t === 'c') patch((a) => ({
          ...a, content: a.content + ev.v,
          seconds: a.seconds ?? (thinkStart ? Math.max(1, Math.round((Date.now() - thinkStart) / 1000)) : undefined),
        }))
        else if (ev.t === 'error') setError(ev.v)
        else if (ev.t === 'compressing') setStatus('Summarizing earlier messages to free up memory…')
        else if (ev.t === 'compressed') setStatus('')
        else if (ev.t === 'done' && ev.context) setCtx(ev.context)
        else if (ev.t === 'title') setConvs((cs) => cs.map((c) => (c.id === targetId ? { ...c, title: ev.v } : c)))
      }, ctrl.signal)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      patch((a) => ({ ...a, live: false }))
      setBusy(false); setStatus(''); abortRef.current = null
      refresh(); loadConvs()
      // reload to get real message ids, but keep the "Thought for Xs" label we measured
      api(`/api/conversations/${targetId}`).then((c) => {
        setMessages((old) => {
          const secs = old[old.length - 1]?.seconds
          const msgs = c.messages
          if (secs && msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs[msgs.length - 1].seconds = secs
          return msgs
        })
        setCtx(c.context)
      }).catch(() => {})
    }
  }

  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant')
  const empty = !convId && messages.length === 0
  const firstName = (user?.email || '').split('@')[0]

  return (
    <>
      <TopBar><ModelPicker effort={effort} setEffort={setEffort} /></TopBar>
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-[12vh]">
          <div className="w-full max-w-3xl fade-up">
            <h1 className="mb-8 text-center text-[1.75rem] font-medium tracking-tight sm:text-3xl">
              {firstName ? <>What's on your mind, {firstName}?</> : 'What can I help with?'}
            </h1>
            <Composer value={input} setValue={setInput} onSend={(t) => run({ content: t })} busy={busy} autoFocus ctx={null} />
            {error && <div className="mt-4"><Alert>{error}</Alert></div>}
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(([verb, rest]) => (
                <button key={verb} onClick={() => run({ content: `${verb} ${rest}` })}
                        className="rounded-2xl border border-line px-4 py-3 text-left text-sm transition-colors hover:bg-hover">
                  <span className="font-medium">{verb}</span> <span className="text-ink-3">{rest}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-4 pt-2 pb-8">
              {loading && messages.length === 0 && <div className="py-10 text-center text-ink-3"><LogoMark className="mx-auto animate-pulse" /></div>}
              {messages.map((m, i) => (
                <div key={m.id ?? `live-${i}`}>
                  {ctx?.summary_upto > 0 && m.id > ctx.summary_upto && !(messages[i - 1]?.id > ctx.summary_upto) && (
                    <div className="my-6 flex items-center gap-3 text-xs text-ink-3">
                      <div className="h-px flex-1 bg-line" />Older messages are summarized in Synapse's memory<div className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  {m.role === 'user'
                    ? <UserMessage m={m} canEdit={!busy && !!m.id} onEdit={(msg, text) => run({ content: text, edit_message_id: msg.id })} />
                    : <AssistantMessage m={m} isLast={i === lastAssistant} canRegenerate={!busy && i === lastAssistant}
                                        onRegenerate={() => run({ regenerate: true })} />}
                </div>
              ))}
              {!busy && messages.length > 0 && messages[messages.length - 1].role === 'user' && !error && (
                <div className="flex justify-start"><button className="btn btn-ghost" onClick={() => run({ regenerate: true })}><RetryIcon size={16} />Get an answer</button></div>
              )}
              {status && <p className="my-3 animate-pulse text-sm text-ink-3">{status}</p>}
              {error && (
                <div className="my-4 flex flex-wrap items-center gap-3">
                  <Alert>{error}</Alert>
                  {!busy && <button className="btn btn-ghost" onClick={() => run({ regenerate: true })}><RetryIcon size={16} />Try again</button>}
                </div>
              )}
            </div>
          </div>
          <div className="px-3 pb-3">
            <div className="mx-auto max-w-3xl">
              <Composer value={input} setValue={setInput} onSend={(t) => run({ content: t })} onStop={() => abortRef.current?.abort()}
                        busy={busy} autoFocus ctx={ctx} />
            </div>
          </div>
        </>
      )}
    </>
  )
}
