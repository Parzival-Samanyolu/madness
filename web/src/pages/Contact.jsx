import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert } from '../components/ui'

const TOPICS = [['myelin', 'Get the Myelin plan'], ['business', 'Business or partnership'], ['other', 'Something else']]

export default function Contact() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const initial = TOPICS.some(([k]) => k === params.get('plan')) ? params.get('plan') : 'myelin'
  const [form, setForm] = useState({ name: '', email: user?.email ?? '', topic: initial, message: '' })
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setState('sending'); setError('')
    try {
      await api('/api/contact', { method: 'POST', body: form })
      setState('sent')
    } catch (err) { setError(err.message); setState('idle') }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-14 px-5 py-16 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <h1 className="font-serif text-5xl tracking-[-0.01em]">Contact us</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">
          Want more than Neuron's free weekly allowance? We set up the Myelin plan by hand for now. Tell us a little about how you use Synapse and we'll reply by email.
        </p>
        <dl className="mt-10 space-y-6 text-sm">
          <div className="border-t border-ink/80 pt-4">
            <dt className="font-serif text-xl">Myelin</dt>
            <dd className="mt-1 leading-relaxed text-ink-2">$10 a month: $50 of use every week, 3 chats at once, longer answers. <Link to="/pricing" className="text-accent underline">Compare plans</Link></dd>
          </div>
          <div className="border-t border-ink/80 pt-4">
            <dt className="font-serif text-xl">Xarı Bülbül</dt>
            <dd className="mt-1 leading-relaxed text-ink-2">Questions about our desktop coding agent are welcome here too.</dd>
          </div>
        </dl>
      </div>
      {state === 'sent' ? (
        <div className="card self-start p-8" role="status">
          <h2 className="font-serif text-3xl">Thanks, we got it</h2>
          <p className="mt-3 text-ink-2">We'll reply to <b className="text-ink">{form.email}</b>, usually within a day or two.</p>
          <Link to="/" className="btn btn-ghost mt-6">Back to home</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card space-y-4 self-start p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm"><span className="mb-1.5 block font-medium">Name</span>
              <input className="input w-full px-4 py-2.5" required maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} /></label>
            <label className="block text-sm"><span className="mb-1.5 block font-medium">Email</span>
              <input className="input w-full px-4 py-2.5" type="email" required maxLength={320} autoComplete="email" value={form.email} onChange={set('email')} /></label>
          </div>
          <label className="block text-sm"><span className="mb-1.5 block font-medium">About</span>
            <select className="input w-full px-4 py-2.5" value={form.topic} onChange={set('topic')}>
              {TOPICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
          <label className="block text-sm"><span className="mb-1.5 block font-medium">Message</span>
            <textarea className="input min-h-36 w-full px-4 py-3" required maxLength={5000} value={form.message} onChange={set('message')}
                      placeholder={form.topic === 'myelin' ? 'What will you use Synapse for? The website, the API, Xarı Bülbül…' : ''} /></label>
          {error && <Alert>{error}</Alert>}
          <button className="btn btn-primary w-full py-3" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send message'}</button>
          <p className="text-xs text-ink-3">We only use your email to reply to this message.</p>
        </form>
      )}
    </div>
  )
}
