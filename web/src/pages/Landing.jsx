import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { LogoMark } from '../components/Logo'
import { ArrowRight, ArrowUpIcon } from '../components/Icons'
import { PlanCards } from './Pricing'

const features = [
  ['Chat', 'Ask anything and get clear, friendly answers in your own language: English, Türkçe, Azərbaycanca and many more.'],
  ['Code', 'Paste an error or a whole file. Synapse explains, debugs and rewrites code, and shows its reasoning when you want to see it.'],
  ['Create', 'Draft emails, plans, stories and ideas. Pick Low, Medium or High thinking for quick replies or deep work.'],
]

const apiSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="https://<this site>/v1",
    api_key="syn_sk_...",
)
reply = client.chat.completions.create(
    model="synapse-2",
    reasoning_effort="medium",
    messages=[{"role": "user", "content": "Hello!"}],
)`

// A still picture of the chat, drawn with HTML so it stays sharp and matches the theme.
function ChatPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_80px_-30px_rgb(0_0_0/0.35)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <LogoMark size={20} /><span className="text-sm font-medium">Synapse-2</span><span className="text-sm text-ink-3">Medium</span>
      </div>
      <div className="space-y-5 px-5 py-6 text-[0.93rem]">
        <div className="flex justify-end"><div className="max-w-[80%] rounded-3xl bg-raised px-4 py-2">Why does my loop skip items when I remove them?</div></div>
        <div>
          <p className="mb-2 text-xs text-ink-3">Thought for 3s</p>
          <p className="leading-relaxed text-ink-2">When you remove an item, everything after it moves one place left, but the loop index still moves right. So the next item gets skipped. Loop over a copy instead:</p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-[#0d1117] px-4 py-3 text-[0.8rem] text-[#e6edf3]">for x in a[:]:{'\n'}    if bad(x):{'\n'}        a.remove(x)</pre>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between rounded-full border border-line bg-raised py-2 pr-2 pl-5 text-sm text-ink-3">
          Ask anything
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-surface"><ArrowUpIcon size={16} /></span>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const start = user ? '/chat' : '/signup'
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <div className="fade-up">
          <h1 className="font-serif text-[3.25rem] leading-[1.02] tracking-[-0.02em] sm:text-[4.5rem] lg:text-[5.25rem]">
            Chat, code<br />and create
          </h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-ink-2">
            Synapse is a friendly AI assistant by Samanyolu AI. Ask questions, fix your code and turn ideas into drafts, in any language.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to={start} className="btn btn-primary px-6 py-3 text-base">{user ? 'Open Synapse' : 'Try Synapse free'}</Link>
            <Link to="/docs" className="btn btn-ghost px-6 py-3 text-base">Build with the API</Link>
          </div>
        </div>
        <div className="fade-up [animation-delay:120ms]"><ChatPreview /></div>
      </section>

      <section id="features" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="max-w-2xl font-serif text-4xl leading-tight tracking-[-0.01em] sm:text-5xl">One assistant for everyday thinking</h2>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {features.map(([t, d], i) => (
              <div key={t} className="border-t border-ink/80 pt-5">
                <div className="text-sm text-ink-3">0{i + 1}</div>
                <h3 className="mt-2 font-serif text-2xl">{t}</h3>
                <p className="mt-3 leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="api" className="scroll-mt-20 bg-panel">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-accent">For developers</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">Your app, powered by synapse-2</h2>
            <p className="mt-5 max-w-md leading-relaxed text-ink-2">
              The Synapse API works with the OpenAI format, so the SDKs and tools you already use just work. Change the address, add your key, and you're done.
            </p>
            <Link to="/docs" className="mt-7 inline-flex items-center gap-2 font-medium hover:gap-3 transition-all">Read the API docs <ArrowRight size={17} /></Link>
          </div>
          <pre className="overflow-x-auto rounded-2xl bg-[#141413] p-6 text-[0.85rem] leading-relaxed text-[#e8e6dc]"><code>{apiSnippet}</code></pre>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1fr_1.4fr]">
          <h2 className="font-serif text-4xl leading-tight sm:text-5xl">Runs on our own hardware</h2>
          <div className="space-y-5 text-lg leading-relaxed text-ink-2">
            <p>Your chats are processed on a GPU we own and run ourselves. They aren't sent to a big AI cloud.</p>
            <p>Long chats stay useful: when a conversation gets long, Synapse summarizes the older parts so it remembers what matters.</p>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-20">
        <h2 className="text-center font-serif text-4xl sm:text-5xl">Simple pricing</h2>
        <p className="mt-4 mb-12 text-center text-ink-2">Start free. Limits reset every day.</p>
        <PlanCards />
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-6xl rounded-3xl bg-[#141413] px-8 py-16 [[data-theme=dark]_&]:bg-[#2b2a27] text-center text-[#faf9f5] sm:py-20">
          <h2 className="font-serif text-4xl sm:text-5xl">Start thinking with Synapse</h2>
          <p className="mx-auto mt-4 max-w-md text-[#c2c0b6]">Free to start. No credit card needed.</p>
          <Link to={start} className="btn mt-8 bg-[#faf9f5] px-6 py-3 text-base text-[#141413] hover:opacity-90">{user ? 'Open Synapse' : 'Create your free account'}</Link>
        </div>
      </section>
    </div>
  )
}
