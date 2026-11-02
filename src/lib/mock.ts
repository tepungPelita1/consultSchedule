import { addDays, format, parseISO } from 'date-fns'
import type { LeaderboardData, WeekCount } from './leaderboard'
import type {
  AllowlistEntry,
  Booking,
  ClassBlock,
  WeekSlot,
  Weekday,
} from './types'

// Data mock supaya UI boleh dibina & diuji TANPA projek Supabase.
// Logic selari dengan RPC dalam supabase/migrations/.

type ScheduleRow = {
  day: Weekday
  start: string
  end: string
  label: string
  venue: string
}

// ===== JADUAL MADAM (pengajar) — edit di sini =====
const MADAM_SCHEDULE: ScheduleRow[] = [
  { day: 1, start: '14:00', end: '16:00', label: 'ICT602', venue: 'M3CS2515B' },
  { day: 2, start: '10:00', end: '12:00', label: 'ITT400', venue: 'M3CS2302A' },
  { day: 3, start: '14:00', end: '16:00', label: 'PHI428', venue: 'M3CS2551A' },
  { day: 3, start: '16:00', end: '18:00', label: 'ICT602', venue: 'M3CS2515A' },
  { day: 4, start: '08:00', end: '10:00', label: 'ICT602', venue: 'M3CS2515B' },
  { day: 4, start: '10:00', end: '12:00', label: 'ITT400', venue: 'M3CS2302A' },
  { day: 4, start: '14:00', end: '16:00', label: 'PHI428', venue: 'M3CS2551B' },
  { day: 5, start: '08:00', end: '10:00', label: 'ICT602', venue: 'M3CS2515A' },
  { day: 5, start: '10:00', end: '12:00', label: 'PHI428', venue: 'M3CS2551B, M3CS2551A' },
]

// ===== JADUAL PELAJAR — edit di sini =====
const STUDENT_SCHEDULE: ScheduleRow[] = [
  { day: 1, start: '08:00', end: '10:00', label: 'ITT626 · Backend', venue: 'DS 1B' },
  { day: 1, start: '14:00', end: '16:00', label: 'ICT602 · Mobile', venue: 'ODL' },
  { day: 1, start: '16:00', end: '18:00', label: 'CSP600 · FYP', venue: 'DS 2A' },
  { day: 2, start: '08:00', end: '10:00', label: 'LCC500 · English', venue: 'BK 19' },
  { day: 2, start: '10:00', end: '12:00', label: 'CSP600 · FYP', venue: 'BT 07' },
  { day: 2, start: '14:00', end: '16:00', label: 'ITT593 · Forensic', venue: 'ODL' },
  { day: 3, start: '08:00', end: '10:00', label: 'ITT626 · Backend', venue: 'JMK 4' },
  { day: 3, start: '10:00', end: '12:00', label: 'ITT550 · Network', venue: 'JMK 11' },
  { day: 3, start: '14:00', end: '16:00', label: 'TAC501 · Arab', venue: 'DS 4A' },
  { day: 3, start: '16:00', end: '18:00', label: 'ITT550 · Network', venue: 'JMK 7' },
  { day: 4, start: '08:00', end: '10:00', label: 'ICT602 · Mobile', venue: 'JMB 1' },
  { day: 4, start: '10:00', end: '12:00', label: 'ITT593 · Forensic', venue: 'JMK 6' },
  { day: 4, start: '14:00', end: '16:00', label: 'ITT550 · Network', venue: 'ODL' },
]

export const MOCK_CLASSES: ClassBlock[] = MADAM_SCHEDULE.map((s, i) => ({
  id: `m${i + 1}`,
  day_of_week: s.day,
  start_time: s.start,
  end_time: s.end,
  label: s.label,
  venue: s.venue,
  owner: 'madam',
  week_start: null,
}))

const MOCK_STUDENT_CLASSES: ClassBlock[] = STUDENT_SCHEDULE.map((s, i) => ({
  id: `s${i + 1}`,
  day_of_week: s.day,
  start_time: s.start,
  end_time: s.end,
  label: s.label,
  venue: s.venue,
  owner: 'student',
  week_start: null,
}))

const INITIAL_ALLOWLIST: AllowlistEntry[] = [
  { id: 'a1', student_id: '2099000011', name: 'STD1', full_name: 'ALI BIN ABU', created_at: '' },
  { id: 'a2', student_id: '2099000022', name: 'STD2', full_name: 'SITI AMINAH BINTI OSMAN', created_at: '' },
  { id: 'a3', student_id: '2099000033', name: 'STD3', full_name: 'MUHAMMAD FARID BIN HASSAN', created_at: '' },
  { id: 'a4', student_id: '2099000044', name: 'STD4', full_name: 'NUR AISYAH BINTI KAMAL', created_at: '' },
  { id: 'a5', student_id: '2099000055', name: 'STD5', full_name: 'ZULKARNAIN BIN IBRAHIM', created_at: '' },
  { id: 'a6', student_id: '2099000066', name: 'STD6', full_name: 'AHMAD HAFIZ BIN SULAIMAN', created_at: '' },
  { id: 'a7', student_id: '2099000077', name: 'STD7', full_name: 'MARINA BINTI YUSOF', created_at: '' },
]

// Booking contoh (status akan di-render ikut minggu semasa)
export function initialMockBookings(weekStart: string): Booking[] {
  const prevWeek = format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd')
  return [
    // Minggu lepas (approved) — nampak bila buka minggu lepas & dikira dalam papan markah.
    {
      id: 'b0',
      week_start: prevWeek,
      day_of_week: 3,
      slot_start: '12:00',
      slot_end: '12:30',
      student_id: '2099000066',
      student_name: 'STD6',
      mode: 'inperson',
      status: 'approved',
      created_at: '',
    },
    {
      id: 'b1',
      week_start: weekStart,
      day_of_week: 1,
      slot_start: '11:00',
      slot_end: '11:30',
      student_id: '2099000011',
      student_name: 'STD1',
      mode: 'inperson',
      status: 'approved',
      created_at: '',
    },
    {
      id: 'b2',
      week_start: weekStart,
      day_of_week: 2,
      slot_start: '12:30',
      slot_end: '13:00',
      student_id: '2099000011',
      student_name: 'STD1',
      mode: 'online',
      status: 'pending',
      created_at: '',
    },
  ]
}

// ---------- In-memory store (demo mode) ----------
interface MockStore {
  allowlist: AllowlistEntry[]
  bookings: Booking[]
  extraClasses: ClassBlock[]
  /** Elak data contoh di-seed semula selepas tempahan dikosongkan. */
  seeded: boolean
}

const store: MockStore = {
  allowlist: [...INITIAL_ALLOWLIST],
  bookings: [],
  extraClasses: [],
  seeded: false,
}

export function ensureMockBookings(weekStart: string): Booking[] {
  if (!store.seeded) {
    store.bookings = initialMockBookings(weekStart)
    store.seeded = true
  }
  return store.bookings
}

export function getMockAllowlist(): AllowlistEntry[] {
  return store.allowlist.map((e) => ({ ...e }))
}

export function getMockExtraClasses(): ClassBlock[] {
  return store.extraClasses.map((e) => ({ ...e }))
}

export function mockAddBooking(booking: Booking): void {
  const entry = store.allowlist.find((e) => e.student_id === booking.student_id)
  const resolved = entry ? { ...booking, student_name: entry.name } : booking
  store.bookings = [resolved, ...store.bookings]
}

export function mockCancelBooking(id: string): void {
  store.bookings = store.bookings.filter((b) => b.id !== id)
}

export function mockCancelBookingBySlot(
  weekStart: string,
  dayOfWeek: Weekday,
  slotStart: string,
  studentId: string,
): void {
  const booking = store.bookings.find(
    (b) =>
      b.week_start === weekStart &&
      b.day_of_week === dayOfWeek &&
      (b.status === 'pending' || b.status === 'approved') &&
      toMinutes(b.slot_start) <= toMinutes(slotStart) &&
      toMinutes(b.slot_end) > toMinutes(slotStart),
  )
  if (!booking) {
    throw new Error('BOOKING_NOT_FOUND')
  }
  if (booking.student_id !== studentId) {
    throw new Error('NOT_YOUR_BOOKING')
  }
  if (booking.status !== 'pending') {
    throw new Error('ALREADY_APPROVED')
  }
  mockCancelBooking(booking.id)
}

export function mockSetStatus(id: string, status: Booking['status']): void {
  store.bookings = store.bookings.map((b) => (b.id === id ? { ...b, status } : b))
}

// ---------- Papan markah (demo) ----------
// Corak kehadiran contoh bagi minggu yang dah selesai (ikut prototaip spec).
// Nilai = bilangan sesi hadir minggu itu. Minggu selepas corak ini → diulang.
const MOCK_ATTENDANCE: Record<string, number[]> = {
  '2099000033': [1, 1, 1, 1, 1], // STD3
  '2099000044': [1, 1, 2, 0, 1], // STD4
  '2099000011': [1, 0, 1, 1, 1], // STD1
  '2099000022': [0, 1, 1, 0, 1], // STD2
  '2099000066': [1, 0, 0, 1, 0], // STD6
  '2099000077': [0, 1, 0, 0, 0], // STD7
  '2099000055': [0, 0, 0, 0, 0], // STD5
}

/** Pelajar demo yang "dah tempah" minggu semasa (selain tempahan sebenar dalam store). */
const MOCK_BOOKED_THIS_WEEK = new Set(['2099000033', '2099000022'])

export function mockGetLeaderboard(
  seasonStart: string,
  lengthWeeks: number,
  currentWeekStart: string,
): LeaderboardData {
  const diffDays = Math.round(
    (parseISO(currentWeekStart).getTime() - parseISO(seasonStart).getTime()) / 86_400_000,
  )
  const currentWeek = Math.floor(diffDays / 7) + 1
  const done = Math.min(Math.max(currentWeek - 1, 0), lengthWeeks)
  const bookings = ensureMockBookings(currentWeekStart)

  const students = [...store.allowlist]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const base = MOCK_ATTENDANCE[entry.student_id] ?? []
      const weeks: WeekCount[] = Array.from({ length: lengthWeeks }, (_, i) => {
        if (i >= done) return null
        const weekStart = format(addDays(parseISO(seasonStart), i * 7), 'yyyy-MM-dd')
        const approved = bookings.filter(
          (b) =>
            b.student_id === entry.student_id &&
            b.week_start === weekStart &&
            b.status === 'approved',
        ).length
        const demo = base.length > 0 ? base[i % base.length] : 0
        return demo + approved
      })
      const bookedThisWeek =
        MOCK_BOOKED_THIS_WEEK.has(entry.student_id) ||
        bookings.some(
          (b) =>
            b.student_id === entry.student_id &&
            b.week_start === currentWeekStart &&
            (b.status === 'pending' || b.status === 'approved'),
        )
      return {
        key: entry.id,
        full_name: entry.full_name || entry.name,
        short_name: entry.name,
        weeks,
        booked_this_week: bookedThisWeek,
      }
    })

  return {
    season: { start_date: seasonStart, length_weeks: lengthWeeks, current_week: currentWeek },
    students,
  }
}

export function mockAddAllowlist(studentId: string, name: string): void {
  store.allowlist = [
    ...store.allowlist.filter((e) => e.student_id !== studentId),
    { id: `mock-${studentId}`, student_id: studentId, name, full_name: name, created_at: '' },
  ]
}

export function mockRemoveAllowlist(studentId: string): void {
  store.allowlist = store.allowlist.filter((e) => e.student_id !== studentId)
}

export function mockAddExtraClass(block: ClassBlock): void {
  store.extraClasses = [...store.extraClasses, block]
}

export function mockRemoveExtraClass(id: string): void {
  store.extraClasses = store.extraClasses.filter((b) => b.id !== id)
}


// ---------- Generators ----------
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(aEnd) > toMinutes(bStart)
}

export function generateMockClassBlocks(weekStart: string): ClassBlock[] {
  const madam = MOCK_CLASSES.map((c) => ({ ...c }))
  const student = MOCK_STUDENT_CLASSES.map((c) => ({ ...c }))
  const extras = store.extraClasses.filter((c) => c.week_start === weekStart)
  return [...madam, ...student, ...extras]
}

export function generateMockSlots(weekStart: string): WeekSlot[] {
  const classes = generateMockClassBlocks(weekStart)
  const bookings = store.bookings.filter(
    (b) => b.week_start === weekStart && (b.status === 'pending' || b.status === 'approved'),
  )
  const slots: WeekSlot[] = []
  for (const day of [1, 2, 3, 4, 5] as Weekday[]) {
    for (let hour = 8; hour < 18; hour++) {
      for (const min of [0, 30]) {
        const start = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
        const endMin = min + 30
        const endHour = endMin === 60 ? hour + 1 : hour
        const end = `${String(endHour).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`

        const isClass = classes.some(
          (c) => c.day_of_week === day && overlaps(start, end, c.start_time, c.end_time),
        )
        const booking = bookings.find(
          (b) =>
            b.day_of_week === day &&
            toMinutes(b.slot_start) < toMinutes(end) &&
            toMinutes(b.slot_end) > toMinutes(start),
        )
        const allowlistEntry = booking
          ? store.allowlist.find((e) => e.student_id === booking.student_id)
          : undefined

        slots.push({
          day_of_week: day,
          slot_start: start,
          slot_end: end,
          status: isClass ? 'class' : booking ? (booking.status as 'pending' | 'approved') : 'available',
          taken: Boolean(booking),
          student_name: booking?.student_name ?? null,
          student_full_name:
            booking?.status === 'approved'
              ? allowlistEntry?.full_name || booking.student_name
              : null,
        })
      }
    }
  }
  return slots
}
