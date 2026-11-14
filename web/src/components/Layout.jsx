import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import { useTheme } from '../theme'
import { Logo } from './Logo'
import { MenuIcon, MoonIcon, SunIcon, XIcon } from './Icons'

export function ThemeButton() {
  const [theme, setTheme] = useTheme()
  return (
    <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

const links = [['/#features', 'Product'], ['/#api', 'API'], ['/#xari-bulbul', 'Xarı Bülbül'], ['/pricing', 'Pricing'], ['/docs', 'Docs'], ['/contact', 'Contact']]

// Pages for visitors (home, pricing, docs): warm "editorial" look.
export default function Layout() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const cls = ({ isActive }) => `text-[0.94rem] ${isActive ? 'text-ink' : 'text-ink-2 hover:text-ink'}`
  return (
    <div className="warm flex min-h-full flex-col bg-surface text-ink">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
          <div className="flex items-center gap-10">
            <Logo />
            <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
              {links.map(([to, label]) => to.includes('#')
                ? <a key={to} href={to} className="text-[0.94rem] text-ink-2 hover:text-ink">{label}</a>
                : <NavLink key={to} to={to} className={cls}>{label}</NavLink>)}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeButton />
            {user ? (
              <Link to="/chat" className="btn btn-primary">Open Synapse</Link>
            ) : (
              <>
                <Link to="/login" className="hidden px-3 text-[0.94rem] text-ink-2 hover:text-ink sm:inline">Log in</Link>
                <Link to="/signup" className="btn btn-primary">Try Synapse</Link>
              </>
            )}
            <button className="icon-btn md:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
              {open ? <XIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-line px-5 py-3 md:hidden" aria-label="Mobile">
            {links.map(([to, label]) => <a key={to} href={to} onClick={() => setOpen(false)} className="block py-2 text-ink-2">{label}</a>)}
            {!user && <Link to="/login" onClick={() => setOpen(false)} className="block py-2 text-ink-2">Log in</Link>}
          </nav>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-ink-2">Synapse is made by Samanyolu AI and runs on our own GPU, not a big AI cloud.</p>
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="mb-3 font-medium">Product</h3>
            <Link to="/chat" className="block text-ink-2 hover:text-ink">Chat</Link>
            <Link to="/pricing" className="block text-ink-2 hover:text-ink">Pricing</Link>
            <Link to="/contact" className="block text-ink-2 hover:text-ink">Contact us</Link>
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="mb-3 font-medium">Developers</h3>
            <Link to="/docs" className="block text-ink-2 hover:text-ink">API docs</Link>
            <Link to="/keys" className="block text-ink-2 hover:text-ink">API keys</Link>
          </div>
          <div className="space-y-2 text-sm">
            <h3 className="mb-3 font-medium">Also from Samanyolu AI</h3>
            <a href="/#xari-bulbul" className="block text-ink-2 hover:text-ink">Xarı Bülbül</a>
            <a href="https://github.com/Parzival-Samanyolu/xari-bulbul/releases/latest" className="block text-ink-2 hover:text-ink">Download the desktop app</a>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-8 text-xs text-ink-3">© {new Date().getFullYear()} Samanyolu AI</div>
      </footer>
    </div>
  )
}
