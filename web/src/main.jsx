import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider, RequireAuth } from './auth'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import { Login, Signup } from './pages/AuthPages'
import Chat from './pages/Chat'
import Keys from './pages/Keys'
import Usage from './pages/Usage'
import Docs from './pages/Docs'
import Admin from './pages/Admin'
import Pricing from './pages/Pricing'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
          <Route path="/chat/:id" element={<RequireAuth><Chat /></RequireAuth>} />
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/keys" element={<RequireAuth><Keys /></RequireAuth>} />
            <Route path="/usage" element={<RequireAuth><Usage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
            <Route path="*" element={<div className="p-16 text-center text-ink-2">Page not found.</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
