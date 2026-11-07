import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

function AuthForm({ mode }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { setUser } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const isSignup = mode === 'signup'

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const u = await api(`/api/auth/${mode}`, { method: 'POST', body: { email, password } })
      setUser(u)
      const next = params.get('next')
      nav(next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mb-6 text-sm text-ink-3">{isSignup ? 'Free to start. No credit card.' : 'Log in to keep chatting.'}</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm text-ink-2">Email
          <input className="input mt-1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm text-ink-2">Password
          <input className="input mt-1" type="password" minLength={isSignup ? 8 : undefined} required
                 autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {isSignup && <p className="text-xs text-ink-3">At least 8 characters.</p>}
        {error && <p role="alert" className="rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">
        {isSignup ? <>Already have an account? <Link className="text-accent underline" to="/login">Log in</Link></>
                  : <>New here? <Link className="text-accent underline" to="/signup">Create an account</Link></>}
      </p>
    </div>
  )
}

export const Login = () => <AuthForm mode="login" />
export const Signup = () => <AuthForm mode="signup" />
