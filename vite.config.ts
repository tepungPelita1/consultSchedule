import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Windows kadang tolak bind ke IPv6 loopback (::1) dengan EACCES.
    // Paksa IPv4 sahaja supaya dev server sentiasa boleh dengar.
    host: '127.0.0.1',
    // 5173 berada dalam julat port "reserved" Windows (5141–5240, Hyper-V),
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
})
