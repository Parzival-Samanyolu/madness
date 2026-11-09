import { Link } from 'react-router-dom'

// "Brain-spark": connected nodes, like neurons meeting at a synapse.
export function LogoMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".55">
        <path d="M16 16 7 8M16 16l9.5-6M16 16l-8 9M16 16l9 8.5" />
      </g>
      <circle cx="16" cy="16" r="4.2" fill="var(--c-accent)" />
      <circle cx="7" cy="8" r="2.6" fill="currentColor" />
      <circle cx="25.5" cy="10" r="2.6" fill="currentColor" />
      <circle cx="8" cy="25" r="2.6" fill="currentColor" />
      <circle cx="25" cy="24.5" r="2.6" fill="currentColor" />
    </svg>
  )
}

export function Logo({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`flex items-center gap-2 text-ink ${className}`} aria-label="Synapse home">
      <LogoMark />
      <span className="text-[1.15rem] font-semibold tracking-tight">Synapse</span>
    </Link>
  )
}
