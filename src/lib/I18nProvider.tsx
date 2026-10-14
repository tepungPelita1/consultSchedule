import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DICTS, I18nContext, readStoredLang } from './i18n'
import type { I18nValue, Lang, TranslationKey } from './i18n'

const STORAGE_KEY = 'csi.language'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang)
    }
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const toggle = useCallback(
    () => setLangState((current) => (current === 'en' ? 'ms' : 'en')),
    [],
  )

  const t = useCallback(
    (key: TranslationKey) => DICTS[lang][key] ?? DICTS.en[key],
    [lang],
  )

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, toggle, t }),
    [lang, setLang, toggle, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
