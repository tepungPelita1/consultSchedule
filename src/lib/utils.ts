import { clsx, type ClassValue } from 'clsx'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { enUS, ms as msLocale } from 'date-fns/locale'
import { twMerge } from 'tailwind-merge'
import type { Lang } from './i18n'

/** Isnin minggu pertama semester — penanda Week 1. */
export const SEMESTER_WEEK1_START = '2026-09-28'

/** Nombor minggu akademik bagi Isnin minggu berkenaan (Week 1 bermula 28 Sep 2026). */
export function weekNumber(weekStart: string): number {
  const diff = differenceInCalendarDays(parseISO(weekStart), parseISO(SEMESTER_WEEK1_START))
  return Math.floor(diff / 7) + 1
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Ambil mesej teks daripada apa-apa ralat (Error, string, atau objek ralat Supabase). */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const value = err as {
      message?: string
      details?: string
      hint?: string
      code?: string
    }
    return [value.message, value.details, value.hint, value.code].filter(Boolean).join(' ')
  }
  return ''
}

export function weekRangeLabel(weekStart: string, lang: Lang): string {
  const locale = lang === 'ms' ? msLocale : enUS
  const monday = parseISO(weekStart)
  const friday = addDays(monday, 4)
  return `${format(monday, 'd MMM', { locale })} – ${format(friday, 'd MMM yyyy', {
    locale,
  })}`
}