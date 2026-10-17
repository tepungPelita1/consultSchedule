import { addDays, format, parseISO } from 'date-fns'
import { supabase } from './supabase'
import type { AllowlistEntry, Booking, BookingMode, ClassBlock, WeekSlot, Weekday } from './types'

/** Tarikh (tahun, bulan, hari) mengikut zon waktu Asia/Kuala_Lumpur. */
function klDateParts(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  return { year: get('year'), month: get('month'), day: get('day') }
}

// Isnin minggu berjalan (format YYYY-MM-DD) mengikut Asia/Kuala_Lumpur.
// Guna tengah hari untuk elak sebarang isu offset; kita cuma perlukan weekday.
// Rollover: 12:00AM Sabtu — minggu kerja dah tamat, jadi "minggu semasa" terus
// jadi minggu hadapan (Sabtu & Ahad). Sama dengan logik book_slot di server
// (0015_weekend_rollover.sql) — jangan ubah sebelah sahaja.
export function getCurrentWeekStart(): string {
  const { year, month, day } = klDateParts()
  const base = new Date(year, month - 1, day, 12)
  const weekday = base.getDay() // 0 = Ahad ... 6 = Sabtu
  const offset = (weekday + 6) % 7 // Mon=0 ... Sun=6
  base.setDate(base.getDate() - offset)
  if (weekday === 6 || weekday === 0) base.setDate(base.getDate() + 7)
  return format(base, 'yyyy-MM-dd')
}

/** Bilangan minggu ke hadapan yang dibuka untuk prebooking (selain minggu semasa). */
export const PREBOOK_WEEKS = 2

/** Senarai minggu boleh tempah: minggu semasa, +1, +2 (Isnin setiap satu). */
export function getBookableWeeks(): string[] {
  const start = parseISO(getCurrentWeekStart())
  return Array.from({ length: PREBOOK_WEEKS + 1 }, (_, i) =>
    format(addDays(start, i * 7), 'yyyy-MM-dd'),
  )
}

/** Isnin minggu terakhir yang boleh ditempah (minggu semasa + 2). */
export function getMaxBookableWeekStart(): string {
  return getBookableWeeks()[PREBOOK_WEEKS]
}

export async function fetchWeekSlots(weekStart: string): Promise<WeekSlot[]> {
  const { data, error } = await supabase.rpc('get_week_slots', {
    p_week_start: weekStart,
  })
  if (error) throw error
  return data as WeekSlot[]
}

export interface BookSlotInput {
  week_start: string
  day_of_week: Weekday
  slot_start: string
  slot_end: string
  student_id: string
  mode: BookingMode
}

export async function bookSlot(input: BookSlotInput): Promise<string> {
  const { data, error } = await supabase.rpc('book_slot', {
    p_week_start: input.week_start,
    p_day_of_week: input.day_of_week,
    p_slot_start: input.slot_start,
    p_slot_end: input.slot_end,
    p_student_id: input.student_id,
    p_mode: input.mode,
  })
  if (error) throw error
  // book_slot returns null bila student ID takde dalam allowlist.
  // (Server return null supaya rekod rate limit tak rollback.)
  if (data === null) throw new Error('NOT_ALLOWLISTED')
  return data as string
}

export async function fetchBookings(weekStart: string, pin: string): Promise<Booking[]> {
  const { data, error } = await supabase.rpc('get_week_bookings', {
    p_week_start: weekStart,
    p_pin: pin,
  })
  if (error) throw error
  return data as Booking[]
}

/** Minggu (dalam senarai diberi) yang ada tempahan aktif — untuk tab Mod madam. */
export async function fetchBookingWeeks(weeks: string[]): Promise<string[]> {
  if (weeks.length === 0) return []
  const { data, error } = await supabase.rpc('get_active_booking_weeks', {
    p_weeks: weeks.join(','),
  })
  if (error) throw error
  return (data as { week_start: string }[]).map((row) => row.week_start)
}

export async function fetchAllowlist(pin: string): Promise<AllowlistEntry[]> {
  const { data, error } = await supabase.rpc('get_supervisees', { p_pin: pin })
  if (error) throw error
  return data as AllowlistEntry[]
}

export async function setBookingStatus(
  bookingId: string,
  status: 'approved' | 'rejected',
  pin: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_booking_status', {
    p_booking_id: bookingId,
    p_status: status,
    p_pin: pin,
  })
  if (error) throw error
}

export async function addAllowlistEntry(
  studentId: string,
  name: string,
  pin: string,
): Promise<void> {
  const { error } = await supabase.rpc('add_allowlist', {
    p_student_id: studentId,
    p_name: name,
    p_pin: pin,
  })
  if (error) throw error
}

export async function removeAllowlistEntry(studentId: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc('remove_allowlist', {
    p_student_id: studentId,
    p_pin: pin,
  })
  if (error) throw error
}

export async function madamVerify(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('madam_verify', { p_pin: pin })
  if (error) throw error
  return Boolean(data)
}

// Kelas tetap (week_start null) + kelas tambahan untuk minggu ini
export async function fetchClassBlocks(weekStart: string): Promise<ClassBlock[]> {
  const { data, error } = await supabase.rpc('get_class_blocks', { p_week_start: weekStart })
  if (error) throw error
  return data as ClassBlock[]
}

export interface ExtraClassInput {
  day_of_week: Weekday
  start_time: string
  end_time: string
  label: string
  venue: string
  week_start: string
}

export async function addExtraClass(input: ExtraClassInput, pin: string): Promise<string> {
  const { data, error } = await supabase.rpc('add_extra_class_block', {
    p_day_of_week: input.day_of_week,
    p_start_time: input.start_time,
    p_end_time: input.end_time,
    p_label: input.label,
    p_venue: input.venue,
    p_week_start: input.week_start,
    p_pin: pin,
  })
  if (error) throw error
  return data as string
}

export async function removeExtraClass(id: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc('remove_extra_class_block', {
    p_id: id,
    p_pin: pin,
  })
  if (error) throw error
}

export async function clearWeekBookings(weekStart: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc('clear_week_bookings', {
    p_week_start: weekStart,
    p_pin: pin,
  })
  if (error) throw error
}

export async function clearWeekExtraClasses(weekStart: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc('clear_week_extra_classes', {
    p_week_start: weekStart,
    p_pin: pin,
  })
  if (error) throw error
}
