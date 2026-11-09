import { useEffect, useState } from 'react'
import { api } from '../api'
import { Alert, Modal } from './ui'
import { CheckIcon, CopyIcon } from './Icons'

export const shareUrl = (token) => `${window.location.origin}/share/${token}`

// "Share chat": makes a public read-only snapshot. Messages sent later stay private.
export default function ShareModal({ conv, onClose }) {
  const [share, setShare] = useState(undefined) // undefined = loading, null = not shared
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!conv) return
    setShare(undefined); setError(''); setCopied(false)
    api(`/api/conversations/${conv.id}`).then((c) => setShare(c.share)).catch((e) => setError(e.message))
  }, [conv])

  const act = async (fn) => {
    setBusy(true); setError(''); setCopied(false)
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const create = () => act(async () => {
    const s = await api(`/api/conversations/${conv.id}/share`, { method: 'POST' })
    setShare(s)
    await navigator.clipboard?.writeText(shareUrl(s.token)).then(() => setCopied(true)).catch(() => {})
  })
  const remove = () => act(async () => { await api(`/api/conversations/${conv.id}/share`, { method: 'DELETE' }); setShare(null) })
  const copy = async () => { await navigator.clipboard.writeText(shareUrl(share.token)); setCopied(true) }

  return (
    <Modal open={!!conv} onClose={onClose} title="Share chat" className="max-w-lg">
      <div className="space-y-4 px-5 py-4 text-sm">
        <p className="text-ink-2">
          Anyone with the link can read <strong className="text-ink">{conv?.title}</strong>, without logging in.
          Messages you send after sharing stay private. Synapse's thinking and your memories are never shared.
        </p>
        {error && <Alert>{error}</Alert>}
        {share === undefined && !error && <p className="text-ink-3">Loading…</p>}
        {share && (
          <div className="flex items-center gap-2 rounded-full border border-line p-1 pl-4">
            <input readOnly value={shareUrl(share.token)} aria-label="Share link" onFocus={(e) => e.target.select()}
                   className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none" />
            <button className="btn btn-primary shrink-0" onClick={copy}>
              {copied ? <><CheckIcon size={16} />Copied</> : <><CopyIcon size={16} />Copy link</>}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 px-5 pb-5">
        {share && <button className="btn btn-ghost text-danger" disabled={busy} onClick={remove}>Turn off link</button>}
        {share && <button className="btn btn-ghost" disabled={busy} onClick={create} title="Include the newest messages">Update link</button>}
        {share === null && <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create link'}</button>}
      </div>
    </Modal>
  )
}
