import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Logo } from '../components/Logo'
import { Alert } from '../components/ui'

function AuthForm({ mode }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState('email') // email -> password, like ChatGPT
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { user, setUser } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const isSignup = mode === 'signup'
  const next = params.get('next')
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat'

  if (user) return <Navigate to={dest} replace />

  async function submit(e) {
    e.preventDefault()
    if (step === 'email') { setStep('password'); setError(''); return }
    setBusy(true); setError('')
    try {
      const u = await api(`/api/auth/${mode}`, { method: 'POST', body: { email, password } })
      setUser(u)
      nav(dest)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <header className="p-5"><Logo /></header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
        <div className="w-full max-w-[22rem] fade-up">
          <h1 className="text-center text-[1.85rem] font-semibold tracking-tight">{isSignup ? 'Create an account' : 'Welcome back'}</h1>
          <p className="mt-2 mb-7 text-center text-sm text-ink-2">
            {isSignup ? 'Free to start. No credit card needed.' : 'Log in to continue with Synapse.'}
          </p>
          <form onSubmit={submit} className="space-y-3">
            <input className="input rounded-full px-5 py-3" type="email" autoComplete="email" required autoFocus
                   placeholder="Email address" aria-label="Email address" value={email}
                   onChange={(e) => { setEmail(e.target.value); if (step === 'password') setStep('email') }} />
            {step === 'password' && (
              <input className="input fade-up rounded-full px-5 py-3" type="password" required autoFocus
                     minLength={isSignup ? 8 : undefined} placeholder={isSignup ? 'Password (at least 8 characters)' : 'Password'}
                     aria-label="Password" autoComplete={isSignup ? 'new-password' : 'current-password'}
                     value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
            {error && <Alert>{error}</Alert>}
            <button className="btn btn-primary w-full py-3 text-[0.95rem]" disabled={busy}>
              {busy ? 'Please wait…' : step === 'email' ? 'Continue' : isSignup ? 'Create account' : 'Log in'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-ink-2">
            {isSignup ? <>Already have an account? <Link className="text-accent hover:underline" to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link></>
                      : <>Don't have an account? <Link className="text-accent hover:underline" to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign up</Link></>}
          </p>
        </div>
      </main>
      <footer className="pb-6 text-center text-xs text-ink-3">
        Synapse by Samanyolu AI · <Link to="/" className="hover:underline">Home</Link> · <Link to="/pricing" className="hover:underline">Pricing</Link>
      </footer>
    </div>
  )
}

export const Login = () => <AuthForm mode="login" />
export const Signup = () => <AuthForm mode="signup" />
