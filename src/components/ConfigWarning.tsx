import { useI18n } from '@/lib/i18n'
import { isPlaceholderSupabaseConfig } from '@/lib/supabase'

/**
 * Amaran yang muncul bila env Supabase masih placeholder (Build variables
 * Cloudflare belum diset). Biasanya tak nampak — hanya semasa konfigurasi
 * deployment rosak, supaya isu "takde data" nampak terus, bukan silent fail.
 */
export default function ConfigWarning() {
  const { t } = useI18n()

  if (!isPlaceholderSupabaseConfig) return null

  return (
    <div className="config-warning" role="alert">
      <b>⚠ {t('configMissing')}</b>
      <span>{t('configMissingHint')}</span>
    </div>
  )
}
