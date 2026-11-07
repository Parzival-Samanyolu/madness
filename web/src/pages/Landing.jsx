import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { PlanCards } from './Pricing'

const features = [
  ['Chat that codes', 'One model for everyday questions and real programming: explanations, debugging, refactors.'],
  ['Shows its thinking', 'Open the reasoning behind any answer, and pick low, medium or high effort.'],
  ['OpenAI-compatible API', 'Change base_url in any OpenAI SDK and your app runs on Madness.'],
  ['Runs on our own GPU', 'Your chats are processed on our own hardware, not sent to a big AI cloud.'],
]

export default function Landing() {
  const { user } = useAuth()
  return (
    <div>
      <section className="mx-auto max-w-4xl px-4 pt-20 pb-14 text-center">
        <p className="mb-4 inline-block rounded-full border border-line px-3 py-1 text-xs text-ink-2">Powered by gpt-oss-20b</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">An AI that chats <span className="text-accent">and</span> codes.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-2">
          Ask anything, paste your code, get streaming answers. Build on it with a simple API.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to={user ? '/chat' : '/signup'} className="btn btn-primary px-6 py-3 text-base">{user ? 'Open chat' : 'Start free'}</Link>
          <Link to="/docs" className="btn btn-ghost px-6 py-3 text-base">Read the API docs</Link>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-16 sm:grid-cols-2">
        {features.map(([t, d]) => (
          <div key={t} className="card p-5"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-ink-2">{d}</p></div>
        ))}
      </section>
      <section className="mx-auto max-w-3xl px-4 pb-20">
        <h2 className="mb-6 text-center text-2xl font-bold">Simple pricing</h2>
        <PlanCards />
      </section>
    </div>
  )
}
