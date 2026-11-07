import { useEffect, useMemo, useState } from 'react'
import { api, fmt } from '../api'
import { useAuth } from '../auth'

const SERIES = [
  { key: 'web_tokens', label: 'Website chat', color: '#3987e5' },
  { key: 'api_tokens', label: 'API', color: '#d95926' },
]

function niceMax(v) {
  if (v <= 0) return 1000
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)
}

// Stacked daily bars: 2px surface gaps between segments/bars, rounded top, hover tooltip.
function UsageChart({ data }) {
  const [hover, setHover] = useState(null)
  const W = 720, H = 240, L = 48, B = 24, T = 8
  const max = niceMax(Math.max(...data.map((d) => d.web_tokens + d.api_tokens)))
  const bw = (W - L) / data.length
  const y = (v) => ((H - B - T) * v) / max
  const ticks = [0, max / 2, max]
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Tokens used per day, last 30 days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={H - B - y(t)} y2={H - B - y(t)} stroke="#2c2c2a" strokeWidth="1" />
            <text x={L - 6} y={H - B - y(t) + 4} textAnchor="end" fontSize="11" fill="#8b8a82">{fmt(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = L + i * bw + 1, w = Math.max(1, bw - 2)
          let base = H - B
          const segs = SERIES.map((s) => ({ ...s, v: d[s.key] })).filter((s) => s.v > 0)
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + i * bw} y={T} width={bw} height={H - B - T} fill="transparent" />
              {segs.map((s, j) => {
                const h = Math.max(1, y(s.v) - (j > 0 ? 2 : 0))
                const top = base - h
                const isTop = j === segs.length - 1
                const r = isTop ? Math.min(4, h, w / 2) : 0
                const path = `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`
                base = top - 2
                return <path key={s.key} d={path} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />
              })}
              {i % 5 === 0 && <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#8b8a82">{d.date.slice(5)}</text>}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
             style={{ left: `min(calc(${((L + hover * bw) / W) * 100}% + 8px), calc(100% - 170px))` }}>
          <div className="mb-1 font-semibold text-ink">{data[hover].date}</div>
          {SERIES.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-ink-2">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}: <span className="text-ink">{fmt(data[hover][s.key])}</span>
            </div>
          ))}
          <div className="mt-1 text-ink-3">{data[hover].requests} requests</div>
        </div>
      )}
    </div>
  )
}

export default function Usage() {
  const { user, refresh } = useAuth()
  const [data, setData] = useState([])
  const [table, setTable] = useState(false)
  useEffect(() => { refresh(); api('/api/usage?days=30').then(setData).catch(() => {}) }, []) // eslint-disable-line
  const used = user?.tokens_used_today ?? 0, limit = user?.plan.tokens_per_day ?? 1
  const pct = Math.min(100, (used / limit) * 100)
  const total = useMemo(() => data.reduce((a, d) => a + d.web_tokens + d.api_tokens, 0), [data])

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Usage</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5 sm:col-span-2">
          <div className="text-sm text-ink-2">Tokens used today</div>
          <div className="mt-1 text-3xl font-bold">{fmt(used)} <span className="text-base font-normal text-ink-3">/ {fmt(limit)}</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#2c2c2a]" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-ink-3">{user?.plan.label} plan · resets 00:00 UTC</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-ink-2">Last 30 days</div>
          <div className="mt-1 text-3xl font-bold">{fmt(total)}</div>
          <div className="mt-2 text-xs text-ink-3">tokens total</div>
        </div>
      </div>
      <div className="card mt-4 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Tokens per day</h2>
          <div className="flex items-center gap-4 text-xs text-ink-2">
            {SERIES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
            <button className="underline" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show table'}</button>
          </div>
        </div>
        {data.length > 0 && (table ? (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-3"><tr><th className="py-1">Date</th><th>Website</th><th>API</th><th>Requests</th></tr></thead>
              <tbody>{[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t border-line"><td className="py-1">{d.date}</td><td>{fmt(d.web_tokens)}</td><td>{fmt(d.api_tokens)}</td><td>{d.requests}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <UsageChart data={data} />)}
      </div>
    </div>
  )
}
