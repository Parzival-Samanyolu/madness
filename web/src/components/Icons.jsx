// Small line icons (24x24, stroke = currentColor).
const I = ({ children, size = 18, className = '', ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...p}>{children}</svg>
)

export const NewChatIcon = (p) => <I {...p}><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4z" /></I>
export const SearchIcon = (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>
export const SidebarIcon = (p) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></I>
export const MenuIcon = (p) => <I {...p}><path d="M4 7h16M4 12h16M4 17h10" /></I>
export const CopyIcon = (p) => <I {...p}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></I>
export const CheckIcon = (p) => <I {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></I>
export const EditIcon = (p) => <I {...p}><path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4z" /></I>
export const RetryIcon = (p) => <I {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></I>
export const TrashIcon = (p) => <I {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></I>
export const DotsIcon = (p) => <I {...p}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></I>
export const ArrowUpIcon = (p) => <I strokeWidth="2.2" {...p}><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></I>
export const StopIcon = (p) => <I {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" /></I>
export const ChevronDown = (p) => <I {...p}><path d="m6 9 6 6 6-6" /></I>
export const ChevronRight = (p) => <I {...p}><path d="m9 6 6 6-6 6" /></I>
export const SunIcon = (p) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>
export const MoonIcon = (p) => <I {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></I>
export const GearIcon = (p) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>
export const KeyIcon = (p) => <I {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></I>
export const ChartIcon = (p) => <I {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>
export const BookIcon = (p) => <I {...p}><path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20" /></I>
export const ShieldIcon = (p) => <I {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></I>
export const LogoutIcon = (p) => <I {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></I>
export const XIcon = (p) => <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>
export const UserIcon = (p) => <I {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></I>
export const DatabaseIcon = (p) => <I {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></I>
export const SparkIcon = (p) => <I {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></I>
export const ArrowRight = (p) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6" /></I>
