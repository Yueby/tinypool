export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme'
const listeners = new Set<() => void>()

function apply(mode: ThemeMode) {
  const isDark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

export function getTheme(): ThemeMode {
  return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system'
}

export function setTheme(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode)
  apply(mode)
  listeners.forEach(fn => fn())
}

export function onThemeChange(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'system') apply('system')
})
