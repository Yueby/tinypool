let container: HTMLElement | null = null

function getContainer(): HTMLElement {
  if (!container) {
    container = document.createElement('div')
    container.className = 'fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none'
    document.body.appendChild(container)
  }
  return container
}

export function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const el = document.createElement('div')
  const colors = {
    success: 'border-ok/30 text-ok',
    error: 'border-err/30 text-err',
    info: 'border-ac/30 text-ac',
  }
  el.className = `pointer-events-auto px-4 py-2.5 rounded-lg border bg-sf text-sm font-medium ${colors[type]} shadow-lg animate-[slideUp_0.15s]`
  el.textContent = message
  getContainer().appendChild(el)
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transition = 'opacity 0.3s'
    setTimeout(() => el.remove(), 300)
  }, 3000)
}
