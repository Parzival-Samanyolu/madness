import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom'
import { api, fmt } from '../api'
import { useAuth } from '../auth'
import { useTheme } from '../theme'
import { LogoMark } from './Logo'
import { Confirm, Dropdown } from './ui'
import SettingsModal from './SettingsModal'
import ShareModal from './ShareModal'
import {
  BookIcon, ChartIcon, DotsIcon, EditIcon, GearIcon, KeyIcon, LogoutIcon, MoonIcon, NewChatIcon, PinIcon,
  SearchIcon, ShareIcon, ShieldIcon, SidebarIcon, SunIcon, TrashIcon, XIcon,
} from './Icons'

const ShellCtx = createContext(null)
export const useShell = () => useContext(ShellCtx)

// "Today", "Yesterday", ... like ChatGPT's sidebar
function groupByDate(convs) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const day = 86400000
  const pinned = convs.filter((c) => c.pinned)
  convs = convs.filter((c) => !c.pinned)
  const groups = [['Pinned', pinned], ['Today', []], ['Yesterday', []], ['Previous 7 days', []], ['Previous 30 days', []], ['Older', []]]
  for (const c of convs) {
    const t = new Date(c.updated_at + (String(c.updated_at).endsWith('Z') ? '' : 'Z')).getTime()
    const i = t >= start ? 0 : t >= start - day ? 1 : t >= start - 7 * day ? 2 : t >= start - 30 * day ? 3 : 4
    groups[i + 1][1].push(c)
  }
  return groups.filter(([, list]) => list.length)
}

function ChatItem({ c, active, onPick, snippet }) {
  const { renameConv, pinConv, askDelete, openShare } = useShell()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(c.title)
  const save = () => { setEditing(false); if (title.trim() && title !== c.title) renameConv(c.id, title.trim()); else setTitle(c.title) }

  if (editing) {
    return (
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} maxLength={200}
             onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setTitle(c.title); setEditing(false) } }}
             aria-label="Chat name" className="w-full rounded-lg border border-accent bg-surface px-2.5 py-2 text-sm outline-none" />
    )
  }
  return (
    <div className={`group relative flex items-center rounded-lg ${active ? 'bg-hover' : 'hover:bg-hover'}`}>
      <Link to={`/chat/${c.id}`} onClick={onPick} className="min-w-0 flex-1 px-2.5 py-2 text-sm" title={c.title}>
        <span className="block truncate">{c.title}</span>
        {snippet && <span className="mt-0.5 line-clamp-2 block text-xs text-ink-3">{snippet}</span>}
      </Link>
      <Dropdown align="right" menuClass="w-44" className={`${active ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
        button={({ toggle }) => (
          <button onClick={toggle} className="icon-btn mr-1 p-1" aria-label={`Options for ${c.title}`}><DotsIcon size={16} /></button>
        )}>
        {(close) => (<>
          <button className="menu-item" onClick={() => { close(); openShare(c) }}><ShareIcon size={16} />Share</button>
          <button className="menu-item" onClick={() => { close(); pinConv(c.id, !c.pinned) }}><PinIcon size={16} />{c.pinned ? 'Unpin' : 'Pin'}</button>
          <button className="menu-item" onClick={() => { close(); setTitle(c.title); setEditing(true) }}><EditIcon size={16} />Rename</button>
          <button className="menu-item text-danger" onClick={() => { close(); askDelete(c) }}><TrashIcon size={16} />Delete</button>
        </>)}
      </Dropdown>
    </div>
  )
}

function AccountMenu() {
  const { user, logout } = useAuth()
  const { openSettings } = useShell()
  const [theme, setTheme] = useTheme()
  const nav = useNavigate()
  const initial = (user?.email || '?')[0].toUpperCase()
  return (
    <Dropdown up menuClass="w-full" className="w-full" button={({ toggle }) => (
      <button onClick={toggle} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-hover" aria-label="Account menu">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{initial}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{user?.email}</span>
          <span className="block text-xs text-ink-3">{user?.plan.label} plan</span>
        </span>
      </button>
    )}>
      {(close) => (<>
        <div className="px-2.5 py-2 text-xs text-ink-3">
          {fmt(user?.tokens_used_today)} / {fmt(user?.plan.tokens_per_day)} tokens used today
        </div>
        <div className="my-1 h-px bg-line" />
        <button className="menu-item" onClick={() => { close(); openSettings() }}><GearIcon size={17} />Settings</button>
        <Link className="menu-item" to="/keys" onClick={close}><KeyIcon size={17} />API keys</Link>
        <Link className="menu-item" to="/usage" onClick={close}><ChartIcon size={17} />Usage</Link>
        <Link className="menu-item" to="/docs" onClick={close}><BookIcon size={17} />API docs</Link>
        {user?.is_admin && <Link className="menu-item" to="/admin" onClick={close}><ShieldIcon size={17} />Admin</Link>}
        <button className="menu-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}{theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="my-1 h-px bg-line" />
        <button className="menu-item" onClick={async () => { close(); await logout(); nav('/') }}><LogoutIcon size={17} />Log out</button>
      </>)}
    </Dropdown>
  )
}

function Sidebar() {
  const { convs, sideOpen, setSideOpen, collapsed, setCollapsed } = useShell()
  const id = useMatch('/chat/:id')?.params.id
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null) // server search: titles and message text
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults(null); return }
    const ctrl = new AbortController()
    const t = setTimeout(() => api(`/api/conversations/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
      .then(setResults).catch(() => {}), 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])
  const quick = q ? convs.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())) : convs
  const shown = results ?? quick
  const snippets = Object.fromEntries((results || []).map((r) => [r.id, r.snippet]))
  const closeMobile = () => setSideOpen(false)

  return (
    <>
      {sideOpen && <div className="fixed inset-0 z-20 md:hidden" style={{ background: 'var(--c-overlay)' }} onClick={closeMobile} />}
      <aside className={`${sideOpen ? 'flex' : 'hidden'} ${collapsed ? 'md:hidden' : 'md:flex'} fixed inset-y-0 left-0 z-30 w-[17rem] flex-col bg-panel md:static`}
             aria-label="Sidebar">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <Link to="/chat" onClick={closeMobile} className="icon-btn text-ink" aria-label="Synapse"><LogoMark size={26} /></Link>
          <button className="icon-btn md:hidden" onClick={closeMobile} aria-label="Close sidebar"><XIcon /></button>
          <button className="icon-btn hidden md:inline-flex" onClick={() => setCollapsed(true)} aria-label="Close sidebar" title="Close sidebar"><SidebarIcon /></button>
        </div>
        <div className="space-y-0.5 px-2">
          <button onClick={() => { closeMobile(); nav('/chat') }} className="menu-item"><NewChatIcon size={18} />New chat</button>
          {searching ? (
            <div className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
              <SearchIcon size={16} className="text-ink-3" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats"
                     className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
                     onKeyDown={(e) => e.key === 'Escape' && (setQ(''), setSearching(false))} />
              <button onClick={() => { setQ(''); setSearching(false) }} className="text-ink-3 hover:text-ink" aria-label="Clear search"><XIcon size={15} /></button>
            </div>
          ) : (
            <button onClick={() => setSearching(true)} className="menu-item"><SearchIcon size={18} />Search chats</button>
          )}
          <NavLink to="/keys" onClick={closeMobile} className={({ isActive }) => `menu-item ${isActive ? 'bg-hover' : ''}`}><KeyIcon size={18} />API keys</NavLink>
        </div>
        <nav className="mt-4 flex-1 overflow-y-auto px-2 pb-2" aria-label="Chats">
          {convs.length === 0 && <p className="px-2.5 text-sm text-ink-3">Your chats will show up here.</p>}
          {q && shown.length === 0 && <p className="px-2.5 text-sm text-ink-3">No chats match "{q}".</p>}
          {groupByDate(shown).map(([label, list]) => (
            <div key={label} className="mb-4">
              <h3 className="px-2.5 pb-1 text-xs font-medium text-ink-3">{label}</h3>
              {list.map((c) => <ChatItem key={c.id} c={c} active={String(c.id) === id} onPick={closeMobile} snippet={snippets[c.id]} />)}
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-2"><AccountMenu /></div>
      </aside>
    </>
  )
}

export default function AppShell() {
  const nav = useNavigate()
  const id = useMatch('/chat/:id')?.params.id
  const [convs, setConvs] = useState([])
  const [sideOpen, setSideOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('synapse-sidebar') === 'closed')
  const [settingsOpen, setSettingsOpen] = useState(false) // false or the tab to open
  const [toDelete, setToDelete] = useState(null)
  const [toShare, setToShare] = useState(null)

  const loadConvs = useCallback(() => api('/api/conversations').then(setConvs).catch(() => {}), [])
  useEffect(() => { loadConvs() }, [loadConvs])
  useEffect(() => { localStorage.setItem('synapse-sidebar', collapsed ? 'closed' : 'open') }, [collapsed])

  const value = useMemo(() => ({
    convs, setConvs, loadConvs, sideOpen, setSideOpen, collapsed, setCollapsed,
    openSettings: (tab = 'general') => setSettingsOpen(typeof tab === 'string' ? tab : 'general'),
    askDelete: setToDelete,
    openShare: setToShare,
    pinConv: async (cid, pinned) => {
      setConvs((cs) => cs.map((c) => (c.id === cid ? { ...c, pinned } : c)))
      await api(`/api/conversations/${cid}`, { method: 'PATCH', body: { pinned } }).catch(loadConvs)
    },
    renameConv: async (cid, title) => {
      setConvs((cs) => cs.map((c) => (c.id === cid ? { ...c, title } : c)))
      await api(`/api/conversations/${cid}`, { method: 'PATCH', body: { title } }).catch(loadConvs)
    },
    deleteConv: async (cid) => {
      await api(`/api/conversations/${cid}`, { method: 'DELETE' })
      setConvs((cs) => cs.filter((c) => c.id !== cid))
      if (String(cid) === id) nav('/chat')
    },
  }), [convs, loadConvs, sideOpen, collapsed, id, nav])

  return (
    <ShellCtx.Provider value={value}>
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col bg-surface"><Outlet /></div>
      </div>
      <SettingsModal open={!!settingsOpen} initialTab={settingsOpen || 'general'} onClose={() => setSettingsOpen(false)} />
      <ShareModal conv={toShare} onClose={() => setToShare(null)} />
      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} title="Delete chat?"
               body={<>This will delete <strong className="text-ink">{toDelete?.title}</strong>. You can't undo this.</>}
               onConfirm={() => value.deleteConv(toDelete.id)} />
    </ShellCtx.Provider>
  )
}

// Top bar used by pages inside the app (chat, keys, usage, admin)
export function TopBar({ children, title }) {
  const { setSideOpen, collapsed, setCollapsed } = useShell()
  const nav = useNavigate()
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2">
      <button className="icon-btn md:hidden" onClick={() => setSideOpen(true)} aria-label="Open sidebar"><SidebarIcon /></button>
      {collapsed && (<>
        <button className="icon-btn hidden md:inline-flex" onClick={() => setCollapsed(false)} aria-label="Open sidebar" title="Open sidebar"><SidebarIcon /></button>
        <button className="icon-btn hidden md:inline-flex" onClick={() => nav('/chat')} aria-label="New chat" title="New chat"><NewChatIcon /></button>
      </>)}
      {title && <h1 className="ml-1 truncate text-lg font-semibold">{title}</h1>}
      {children}
    </header>
  )
}
