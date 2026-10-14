import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface LangToggleProps {
  className?: string
}

/** Pill that toggles EN ⇄ BM. */
function LangToggle({ className }: LangToggleProps) {
  const { lang, toggle, t } = useI18n()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('language')}
      title={t('language')}
      className={cn('pill', className)}
    >
      {lang.toUpperCase()} → {t('switchTo')}
    </button>
  )
}

export default LangToggle
