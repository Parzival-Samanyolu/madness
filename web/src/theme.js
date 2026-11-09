import { useEffect, useState } from 'react'

// Dark is the default. The choice is saved in this browser only.
const KEY = 'synapse-theme'

export const getTheme = () => (localStorage.getItem(KEY) === 'light' ? 'light' : 'dark')

export function setTheme(t) {
  localStorage.setItem(KEY, t)
  document.documentElement.dataset.theme = t
  window.dispatchEvent(new Event('themechange'))
}

export function useTheme() {
  const [theme, set] = useState(getTheme)
  useEffect(() => {
    const on = () => set(getTheme())
    window.addEventListener('themechange', on)
    return () => window.removeEventListener('themechange', on)
  }, [])
  return [theme, setTheme]
}
