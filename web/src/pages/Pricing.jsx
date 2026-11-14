import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmt, tokensFor, usd } from '../api'

export function PlanCards() {
  const [plans, setPlans] = useState([])
  useEffect(() => { api('/api/plans').then(setPlans).catch(() => {}) }, [])
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {plans.map((p) => (
        <div key={p.name} className={`card flex flex-col p-6 ${p.name === 'pro' ? 'border-accent' : ''}`}>
          <div className="flex items-baseline justify-between">
            <h3 className="font-serif text-2xl">{p.label}</h3>
            <div><span className="text-3xl font-semibold">${p.price_usd}</span><span className="text-ink-3">/mo</span></div>
          </div>
          <p className="mt-1 text-sm text-ink-3">{p.price_usd === 0 ? 'Free forever' : 'Billed monthly'}</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">
            <li>✓ <b className="font-semibold text-ink">{usd(p.usd_per_week)} of use every week</b> (about {tokensFor(p.usd_per_week, p.price_per_million_usd)} tokens)</li>
            <li>✓ {p.requests_per_minute} requests per minute</li>
            <li>✓ {fmt(p.max_context_tokens)} tokens of chat memory (context)</li>
            <li>✓ Up to {fmt(p.max_output_tokens)} tokens per answer</li>
            <li>✓ {p.max_concurrent} chat{p.max_concurrent > 1 ? 's' : ''} generating at once</li>
            <li>✓ Website chat + OpenAI-compatible API</li>
          </ul>
          {p.price_usd === 0
            ? <Link to="/signup" className="btn btn-primary mt-6 w-full">Start free</Link>
            : <Link to={`/contact?plan=${p.name === 'pro' ? 'myelin' : 'other'}`} className="btn btn-primary mt-6 w-full">Contact us to get {p.label}</Link>}
        </div>
      ))}
    </div>
  )
}

// How use is measured, shared by the pricing page and the home page.
export function PricingNotes() {
  const [plans, setPlans] = useState([])
  useEffect(() => { api('/api/plans').then(setPlans).catch(() => {}) }, [])
  const p = plans[0]
  if (!p) return null
  return (
    <div className="mt-10 grid gap-6 text-sm text-ink-2 sm:grid-cols-3">
      <div><h3 className="mb-1 font-semibold text-ink">One price for every token</h3>
        <p>Use is measured at {usd(p.price_per_million_usd)} per million tokens, for both what you send and what Synapse writes. You never pay per token: it only counts against your weekly allowance.</p></div>
      <div><h3 className="mb-1 font-semibold text-ink">Repeated text is cheaper</h3>
        <p>When Synapse has already read the start of a chat, those tokens come from its cache and count at {usd(p.cache_price_per_million_usd)} per million, a tenth of the price. Long chats and coding agents benefit most.</p></div>
      <div><h3 className="mb-1 font-semibold text-ink">Getting Myelin</h3>
        <p>We set up paid plans by hand for now. <Link to="/contact?plan=myelin" className="text-accent underline">Send us a message</Link> and we'll get you set up.</p></div>
    </div>
  )
}

export default function Pricing() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <h1 className="mb-3 font-serif text-5xl tracking-[-0.01em]">Pricing</h1>
      <p className="mb-10 text-lg text-ink-2">Start free with Neuron. Your weekly allowance resets every Monday at 00:00 UTC.</p>
      <PlanCards />
      <PricingNotes />
    </div>
  )
}
