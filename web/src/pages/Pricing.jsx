import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmt } from '../api'

export function PlanCards() {
  const [plans, setPlans] = useState([])
  useEffect(() => { api('/api/plans').then(setPlans).catch(() => {}) }, [])
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {plans.map((p) => (
        <div key={p.name} className={`card p-6 ${p.name === 'pro' ? 'border-accent' : ''}`}>
          <div className="flex items-baseline justify-between">
            <h3 className="font-serif text-2xl">{p.label}</h3>
            <div><span className="text-3xl font-semibold">${p.price_usd}</span><span className="text-ink-3">/mo</span></div>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-ink-2">
            <li>✓ {fmt(p.tokens_per_day)} tokens per day</li>
            <li>✓ {p.requests_per_minute} requests per minute</li>
            <li>✓ {fmt(p.max_context_tokens)} tokens of chat memory (context)</li>
            <li>✓ Up to {fmt(p.max_output_tokens)} tokens per answer</li>
            <li>✓ {p.max_concurrent} chat{p.max_concurrent > 1 ? 's' : ''} generating at once</li>
            <li>✓ Website chat + OpenAI-compatible API</li>
          </ul>
          {p.price_usd === 0
            ? <Link to="/signup" className="btn btn-primary mt-6 w-full">Start free</Link>
            : <button className="btn btn-ghost mt-6 w-full" disabled>Coming soon</button>}
        </div>
      ))}
    </div>
  )
}

export default function Pricing() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <h1 className="mb-3 font-serif text-5xl tracking-[-0.01em]">Pricing</h1>
      <p className="mb-10 text-lg text-ink-2">Start free. Limits reset every day at 00:00 UTC.</p>
      <PlanCards />
    </div>
  )
}
