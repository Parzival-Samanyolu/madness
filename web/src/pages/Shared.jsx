import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import Markdown from '../components/Markdown'
import { Logo, LogoMark } from '../components/Logo'

// Public, read-only view of a shared chat (/share/:token). No login needed.
export default function Shared() {
  const { token } = useParams()
  const { user } = useAuth()
  const [chat, setChat] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/shared/${encodeURIComponent(token)}`).then((c) => { setChat(c); document.title = `${c.title} · Synapse` })
      .catch((e) => setError(e.message))
  }, [token])

  const date = chat && new Date(chat.created_at + (String(chat.created_at).endsWith('Z') ? '' : 'Z'))
    .toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <header className="flex items-center justify-between px-5 py-4">
        <Logo />
        <Link to={user ? '/chat' : '/signup'} className="btn btn-primary">{user ? 'Open Synapse' : 'Try Synapse free'}</Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
        {error && (
          <div className="py-24 text-center">
            <h1 className="text-2xl font-semibold">Link not found</h1>
            <p className="mt-2 text-ink-2">{error}</p>
          </div>
        )}
        {!chat && !error && <div className="py-24"><LogoMark className="mx-auto animate-pulse" /></div>}
        {chat && (
          <>
            <div className="border-b border-line pt-6 pb-5">
              <h1 className="text-[1.75rem] font-semibold tracking-tight">{chat.title}</h1>
              <p className="mt-1 text-sm text-ink-3">Shared conversation · {date}</p>
            </div>
            {chat.messages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="my-5 flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-raised px-5 py-2.5">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="my-5"><Markdown text={m.content} /></div>
            ))}
            <p className="mt-10 border-t border-line pt-5 text-center text-sm text-ink-3">
              This is a copy of a chat with Synapse by Samanyolu AI. Synapse can make mistakes.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
