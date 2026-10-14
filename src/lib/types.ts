export type Weekday = 1 | 2 | 3 | 4 | 5

export type SlotStatus = 'class' | 'available' | 'pending' | 'approved'

export type BookingMode = 'inperson' | 'online'

export type BookingStatus = 'pending' | 'approved' | 'rejected'

/** Pemilik jadual kelas: Madam (pengajar) atau Pelajar (sendiri). */
export type ClassOwner = 'madam' | 'student'

export interface WeekSlot {
  day_of_week: Weekday
  slot_start: string // '08:00'
  slot_end: string // '08:30'
  status: SlotStatus
  booking_id: string | null
  student_name: string | null
  mode: BookingMode | null
}

/** Julat masa dipilih (drag/klik) untuk tempahan. */
export interface FreeBlock {
  day_of_week: Weekday
  start: string // '11:00'
  end: string // '12:00' (akhir eksklusif)
}

export interface ClassBlock {
  id: string
  day_of_week: Weekday
  start_time: string
  end_time: string
  label: string
  venue: string
  /** Siapa punya kelas: madam (pengajar) atau student (pelajar) */
  owner: ClassOwner
  /** null = berulang mingguan; ada nilai = kelas tambahan minggu itu sahaja */
  week_start: string | null
}

export interface AllowlistEntry {
  id: string
  student_id: string
  name: string
  created_at: string
}

export interface Booking {
  id: string
  week_start: string
  day_of_week: Weekday
  slot_start: string
  slot_end: string
  student_id: string
  student_name: string
  mode: BookingMode
  status: BookingStatus
  created_at: string
}

export const WEEKDAYS: { value: Weekday; key: string }[] = [
  { value: 1, key: 'mon' },
  { value: 2, key: 'tue' },
  { value: 3, key: 'wed' },
  { value: 4, key: 'thu' },
  { value: 5, key: 'fri' },
]
