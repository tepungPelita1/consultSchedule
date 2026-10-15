import { supabase } from './supabase'
import type { AllowlistEntry, Booking, BookingMode, ClassBlock, WeekSlot, Weekday } from './types'

// Isnin minggu semasa (format YYYY-MM-DD) — soft reset: paparan ikut minggu ini sahaja
export function getCurrentWeekStart(): string {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // Mon=0 ... Sun=6
  const monday = new Date(now)
  monday.setDate(now.getDate() - day)
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
  return data as string
}

export async function cancelBooking(bookingId: string, studentId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_student_id: studentId,
  })
  if (error) throw error
}

export async function fetchBookings(weekStart: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('week_start', weekStart)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Booking[]
}

export async function fetchAllowlist(): Promise<AllowlistEntry[]> {
  const { data, error } = await supabase
    .from('allowlist')
    .select('*')
    .order('name', { ascending: true })
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
  const { data, error } = await supabase
    .from('class_blocks')
    .select('*')
    .or(`week_start.is.null,week_start.eq.${weekStart}`)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })
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
