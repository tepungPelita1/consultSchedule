import { clsx, type ClassValue } from 'clsx'
import { addDays, format, parseISO } from 'date-fns'
import { enUS, ms as msLocale } from 'date-fns/locale'
import { twMerge } from 'tailwind-merge'
import type { Lang } from './i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function weekRangeLabel(weekStart: string, lang: Lang): string {
  const locale = lang === 'ms' ? msLocale : enUS
  const monday = parseISO(weekStart)
  const friday = addDays(monday, 4)
  return `${format(monday, 'd MMM', { locale })} – ${format(friday, 'd MMM yyyy', {
    locale,
  })}`
}