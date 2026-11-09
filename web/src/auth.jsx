import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from './api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading, null = logged out
  const refresh = useCallback(() => api('/api/auth/me').then(setUser).catch(() => setUser(null)), [])
  useEffect(() => { refresh() }, [refresh])
  const logout = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null) }
  return <AuthCtx.Provider value={{ user, setUser, refresh, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)

export function RequireAuth({ children, admin = false }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (user === undefined) return <div className="flex h-full items-center justify-center text-ink-3">Loading…</div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  if (admin && !user.is_admin) return <Navigate to="/chat" replace />
  return children
}
