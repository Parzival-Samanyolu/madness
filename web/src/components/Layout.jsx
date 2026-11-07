import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-ink">
      <img src="/favicon.svg" alt="" className="h-7 w-7" /> Madness
    </Link>
  )
}

export function NavLinks({ vertical = false }) {
  const { user } = useAuth()
  const cls = ({ isActive }) =>
    `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-[#232321] text-ink' : 'text-ink-2 hover:text-ink'}`
  return (
    <nav className={`flex ${vertical ? 'flex-col' : 'items-center'} gap-1`}>
      <NavLink to="/chat" className={cls}>Chat</NavLink>
      {user && <NavLink to="/keys" className={cls}>API keys</NavLink>}
      {user && <NavLink to="/usage" className={cls}>Usage</NavLink>}
      <NavLink to="/docs" className={cls}>Docs</NavLink>
      {!user && <NavLink to="/pricing" className={cls}>Pricing</NavLink>}
      {user?.is_admin && <NavLink to="/admin" className={cls}>Admin</NavLink>}
    </nav>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6"><Logo /><div className="hidden sm:block"><NavLinks /></div></div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-ink-3 md:inline">{user.email}</span>
                <button className="btn btn-ghost" onClick={async () => { await logout(); nav('/') }}>Log out</button>
              </>
            ) : user === null ? (
              <>
                <Link to="/login" className="btn btn-ghost">Log in</Link>
                <Link to="/signup" className="btn btn-primary">Sign up</Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="px-2 pb-2 sm:hidden"><NavLinks /></div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line py-6 text-center text-xs text-ink-3">
        Madness AI · runs on our own GPU · <Link to="/docs" className="underline">API docs</Link>
      </footer>
    </div>
  )
}
