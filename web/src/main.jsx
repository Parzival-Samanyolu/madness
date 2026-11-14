import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider, RequireAuth } from './auth'
import Layout from './components/Layout'
import AppShell from './components/AppShell'
import Landing from './pages/Landing'
import { Login, Signup } from './pages/AuthPages'
import Chat from './pages/Chat'
import Keys from './pages/Keys'
import Usage from './pages/Usage'
import Docs from './pages/Docs'
import Admin from './pages/Admin'
import Pricing from './pages/Pricing'
import Shared from './pages/Shared'
import Contact from './pages/Contact'

function NotFound() {
  return (
    <div className="px-5 py-28 text-center">
      <h1 className="font-serif text-5xl">Page not found</h1>
      <p className="mt-4 text-ink-2">This page doesn't exist. <Link to="/" className="text-accent hover:underline">Go home</Link></p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* the app: ChatGPT-style sidebar */}
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/:id" element={<Chat />} />
            <Route path="/keys" element={<Keys />} />
            <Route path="/usage" element={<Usage />} />
            <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
          </Route>
          {/* login / sign-up: standalone */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/share/:token" element={<Shared />} />
          {/* public pages: warm editorial style */}
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
