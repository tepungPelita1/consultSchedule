import { createContext, useContext } from 'react'

export type Lang = 'en' | 'ms'

const en = {
  appTitle: 'Anak-Anak Madam Idayati',
  headerMeta: 'Consultation · Mon – Fri · 8 am – 6 pm',
  prevWeek: 'Previous week',
  nextWeek: 'Next week',
  thisWeek: 'This week',
  legendFree: 'Free',
  legendClass: 'Class',
  legendMadam: 'Madam class',
  legendStudent: 'Student class',
  tipMadamClass: 'Madam Idayati’s class',
  tipStudentClass: 'Student class',
  dragHint: 'Drag across empty slots to pick a duration',
  freeSlots: '{n} free slots this week',
  freeSlotsNone: 'No free slots this week',
  madamMode: 'Madam mode: add extra classes',
  madamPinTitle: 'Madam mode',
  madamPinBody: 'Enter PIN to unlock Madam mode',
  madamPinPlaceholder: 'PIN',
  madamSignIn: 'Unlock',
  madamSignOut: 'Lock',
  madamActive: 'Madam mode on',
  unauthorized: 'Wrong PIN',
  bookSlot: 'Book',
  studentId: 'Student ID',
  studentIdPlaceholder: 'e.g. 2025******',
  studentIdHint: 'student ID',
  invalidStudentId: 'Student ID must be 10 digits (numbers only)',
  mode: 'Mode',
  inperson: 'In person',
  online: 'Online',
  submit: 'Book',
  cancel: 'Cancel',
  close: 'Close',
  loading: 'Loading…',
  errorMsg: 'Something went wrong',
  retry: 'Retry',
  statusPending: 'Pending',
  statusApproved: 'Approved',
  approve: 'Approve',
  reject: 'Reject',
  remove: 'Remove',
  add: 'Add',
  allowlist: 'Student list',
  weekBookings: 'Bookings this week',
  studentName: 'Student name',
  studentNamePlaceholder: 'e.g. Nur Aina',
  noBookings: 'No bookings yet this week.',
  noAllowlist: 'No students in the list yet.',
  bookingSent: 'Booking sent! Waiting for approval.',
  demoMode: 'Demo mode — Supabase not connected',
  successTitle: 'Request sent',
  successBody: 'Your slot is pending. Madam will approve it soon.',
  added: 'Added to list',
  removed: 'Removed from list',
  updated: 'Booking updated',
  extraAdded: 'Extra class added',
  extraRemoved: 'Extra class removed',
  notAllowlisted: 'Student ID is not in the list',
  slotTaken: 'Slot already taken',
  dailyLimit: 'You already have a booking today',
  wrongWeek: 'Booking is only open for the current week',
  classTime: 'This slot is during a class',
  cancelTitle: 'Cancel booking',
  cancelBody: 'Enter your student ID to cancel this slot',
  cancelConfirm: 'Cancel booking',
  cancelHint: 'Tap your booked slot to cancel',
  cancelled: 'Booking cancelled',
  notYourBooking: 'This booking belongs to another student',
  bookingNotFound: 'Booking not found',
  removeClass: 'Remove class',
  addExtraLabel: 'Extra class label',
  addExtraVenue: 'Venue (optional)',
  language: 'Language',
  switchTo: 'BM',
  mon: 'MON',
  tue: 'TUE',
  wed: 'WED',
  thu: 'THU',
  fri: 'FRI',
  monFull: 'Monday',
  tueFull: 'Tuesday',
  wedFull: 'Wednesday',
  thuFull: 'Thursday',
  friFull: 'Friday',
} as const

export type TranslationKey = keyof typeof en

const ms: Record<TranslationKey, string> = {
  appTitle: 'Anak-Anak Madam Idayati',
  headerMeta: 'Konsultasi · Isnin – Jumaat · 8 pagi – 6 petang',
  prevWeek: 'Minggu sebelum',
  nextWeek: 'Minggu seterusnya',
  thisWeek: 'Minggu ini',
  legendFree: 'Kosong',
  legendClass: 'Ada kelas',
  legendMadam: 'Kelas Madam',
  legendStudent: 'Kelas Pelajar',
  tipMadamClass: 'Kelas Madam Idayati',
  tipStudentClass: 'Kelas Pelajar',
  dragHint: 'Seret merentas slot kosong untuk pilih tempoh',
  freeSlots: '{n} slot kosong minggu ini',
  freeSlotsNone: 'Tiada slot kosong minggu ini',
  madamMode: 'Mod madam: tandakan kelas tambahan',
  madamPinTitle: 'Mod madam',
  madamPinBody: 'Masukkan PIN untuk buka Mod madam',
  madamPinPlaceholder: 'PIN',
  madamSignIn: 'Buka',
  madamSignOut: 'Kunci',
  madamActive: 'Mod madam aktif',
  unauthorized: 'PIN salah',
  bookSlot: 'Tempah',
  studentId: 'ID Pelajar',
  studentIdPlaceholder: 'cth. 2025******',
  studentIdHint: 'ID pelajar',
  invalidStudentId: '(Nombor sahaja)',
  mode: 'Mod',
  inperson: 'Bersemuka',
  online: 'Online',
  submit: 'Tempah',
  cancel: 'Batal',
  close: 'Tutup',
  loading: 'Memuatkan…',
  errorMsg: 'Ada masalah berlaku',
  retry: 'Cuba lagi',
  statusPending: 'Menunggu',
  statusApproved: 'Disetujui',
  approve: 'Setuju',
  reject: 'Tolak',
  remove: 'Buang',
  add: 'Tambah',
  allowlist: 'Senarai pelajar',
  weekBookings: 'Tempahan minggu ini',
  studentName: 'Nama pelajar',
  studentNamePlaceholder: 'cth. Nur Aina',
  noBookings: 'Belum ada tempahan minggu ini.',
  noAllowlist: 'Belum ada pelajar dalam senarai.',
  bookingSent: 'Tempahan dihantar! Menunggu kelulusan.',
  demoMode: 'Mod demo — Supabase belum disambung',
  successTitle: 'Permohonan dihantar',
  successBody: 'Slot anda menunggu kelulusan Madam.',
  added: 'Ditambah ke senarai',
  removed: 'Dibuang dari senarai',
  updated: 'Tempahan dikemaskini',
  extraAdded: 'Kelas tambahan ditambah',
  extraRemoved: 'Kelas tambahan dibuang',
  notAllowlisted: 'ID pelajar tiada dalam senarai',
  slotTaken: 'Slot sudah diambil',
  dailyLimit: 'Anda sudah ada tempahan hari ini',
  wrongWeek: 'Tempahan hanya untuk minggu semasa',
  classTime: 'Slot ini waktu kelas',
  cancelTitle: 'Batal tempahan',
  cancelBody: 'Masukkan ID pelajar anda untuk batal slot ini',
  cancelConfirm: 'Batal tempahan',
  cancelHint: 'Tekan slot anda untuk batal',
  cancelled: 'Tempahan dibatalkan',
  notYourBooking: 'Tempahan ini milik pelajar lain',
  bookingNotFound: 'Tempahan tidak ditemui',
  removeClass: 'Buang kelas',
  addExtraLabel: 'Label kelas tambahan',
  addExtraVenue: 'Tempat (pilihan)',
  language: 'Bahasa',
  switchTo: 'EN',
  mon: 'ISN',
  tue: 'SEL',
  wed: 'RAB',
  thu: 'KHA',
  fri: 'JUM',
  monFull: 'Isnin',
  tueFull: 'Selasa',
  wedFull: 'Rabu',
  thuFull: 'Khamis',
  friFull: 'Jumaat',
}

const DICTS: Record<Lang, Record<TranslationKey, string>> = { en, ms }

export { DICTS }

const STORAGE_KEY = 'csi.language'

export interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
  t: (key: TranslationKey) => string
}

export const I18nContext = createContext<I18nValue | null>(null)

export function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'ms' ? 'ms' : 'en'
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}

/** Tiny `{token}` interpolation helper. */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  )
}
