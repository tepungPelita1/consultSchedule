import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * Hasilkan `dist/_headers` daripada `config/headers.tmpl`.
 *
 * Origin Supabase diambil dari `VITE_SUPABASE_URL` masa build dan disuntik
 * ke dalam CSP `connect-src`. Tujuannya supaya URL projek Supabase tidak
 * perlu ditulis dalam repo (repo ini public). Kalau env tiada (mock mode),
 * CSP keluar tanpa origin Supabase - memang betul, sebab mock mode tak
 * buat panggilan rangkaian.
 */
function emitHeaders(supabaseUrl: string): Plugin {
  return {
    name: 'emit-headers',
    apply: 'build',
    closeBundle() {
      const tmpl = readFileSync(
        fileURLToPath(new URL('./config/headers.tmpl', import.meta.url)),
        'utf8',
      )
      let connect = ''
      if (supabaseUrl) {
        const { origin } = new URL(supabaseUrl)
        connect = ` ${origin} ${origin.replace(/^https:/, 'wss:')}`
      }
      writeFileSync(
        fileURLToPath(new URL('./dist/_headers', import.meta.url)),
        tmpl.replaceAll('__SUPABASE_CONNECT__', connect),
        'utf8',
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss(), emitHeaders(env.VITE_SUPABASE_URL ?? '')],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Windows kadang tolak bind ke IPv6 loopback (::1) dengan EACCES.
      // Paksa IPv4 sahaja supaya dev server sentiasa boleh dengar.
      host: '127.0.0.1',
      // 5173 berada dalam julat port "reserved" Windows (5141-5240, Hyper-V),
      // jadi guna port di luar julat itu.
      port: 3000,
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'supabase', test: /supabase/ },
              { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)/ },
              { name: 'vendor', test: /node_modules/ },
            ],
          },
        },
      },
    },
  }
})
