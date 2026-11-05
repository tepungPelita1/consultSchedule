import { createClient } from '@supabase/supabase-js'

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// Penanda nilai placeholder dalam .env.production / .env.example. Kalau URL atau
// anon key masih macam ni, maksudnya kredensial sebenar belum diset (cth. Build
// variables Cloudflare). `isSupabaseConfigured` tetap true sebab placeholder
// bukan kosong, jadi app cuba panggil Supabase yang tak wujud dan semua
// permintaan gagal — inilah yang buat pending/book & ranking tak muncul.
const PLACEHOLDER_MARKERS = ['DIKELUARKAN', 'your-project', 'your-anon-key']

/** True bila config Supabase "hidup" tapi masih guna nilai placeholder. */
export const isPlaceholderSupabaseConfig =
  isSupabaseConfigured &&
  PLACEHOLDER_MARKERS.some(
    (marker) => supabaseUrl.includes(marker) || supabaseAnonKey.includes(marker),
  )

export const supabase = createClient(
  supabaseUrl || 'http://localhost',
  supabaseAnonKey || 'public-anon-key',
)