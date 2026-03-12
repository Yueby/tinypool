import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const buildVersion = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${pad(d.getHours())}${pad(d.getMinutes())}`
}

export default defineConfig({
  plugins: [tailwindcss(), viteSingleFile()],
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion()),
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:8787',
      '/keys': 'http://127.0.0.1:8787',
      '/stats': 'http://127.0.0.1:8787',
      '/tokens': 'http://127.0.0.1:8787',
      '/settings': 'http://127.0.0.1:8787',
      '/pick': 'http://127.0.0.1:8787',
      '/docs': 'http://127.0.0.1:8787',
      '/openapi.json': 'http://127.0.0.1:8787',
    },
  },
})
