import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ensureMockBookings,
  generateMockClassBlocks,
  generateMockSlots,
  getMockAllowlist,
  mockAddAllowlist,
  mockAddBooking,
  mockAddExtraClass,
  mockClearWeekBookings,
  mockClearWeekExtraClasses,
  mockRemoveAllowlist,
  mockRemoveExtraClass,
  mockSetStatus,
} from './mock'
import {
  addAllowlistEntry,
  addExtraClass,
  bookSlot,
  clearWeekBookings,
  clearWeekExtraClasses,
  fetchAllowlist,
  fetchBookingWeeks,
  fetchBookings,
  fetchClassBlocks,
  fetchWeekSlots,
  getCurrentWeekStart,
  madamVerify,
  removeAllowlistEntry,
  removeExtraClass,
  setBookingStatus,
} from './slots'
import type { ExtraClassInput } from './slots'
import { isSupabaseConfigured } from './supabase'
import type {
  AllowlistEntry,
  Booking,
  BookingMode,
  ClassBlock,
  Weekday,
  WeekSlot,
} from './types'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * PIN demo untuk mod mock — BUKAN PIN sebenar.
 * Untuk demo lokal, set `VITE_MOCK_MADAM_PIN` dalam `.env.local` (gitignored).
 * Jangan set dalam build produksi kerana ia akan masuk bundle.
 */
export const MOCK_MADAM_PIN = import.meta.env.VITE_MOCK_MADAM_PIN ?? 'DEMO-PIN-NOT-REAL'

const weekSlotsKey = (weekStart: string) => ['week-slots', weekStart] as const
const classBlocksKey = (weekStart: string) => ['class-blocks', weekStart] as const
const bookingsKey = (weekStart: string) => ['bookings', weekStart] as const
const allowlistKey = ['allowlist'] as const
const bookingWeeksKey = ['booking-weeks'] as const

/* ------------------------------------------------------------------ *
 * Slots + class blocks (minggu berkenaan)
 * ------------------------------------------------------------------ */

export function useWeekView(weekStart: string) {
  const slots = useQuery({
    queryKey: weekSlotsKey(weekStart),
    queryFn: async (): Promise<WeekSlot[]> => {
      if (isSupabaseConfigured) return fetchWeekSlots(weekStart)
      await delay(250)
      return generateMockSlots(weekStart)
    },
  })

  const classBlocks = useQuery({
    queryKey: classBlocksKey(weekStart),
    queryFn: async (): Promise<ClassBlock[]> => {
      if (isSupabaseConfigured) return fetchClassBlocks(weekStart)
      await delay(200)
      return generateMockClassBlocks(weekStart)
    },
  })

  return {
    slots: slots.data ?? [],
    classBlocks: classBlocks.data ?? [],
    isLoading: slots.isLoading || classBlocks.isLoading,
    error: slots.error ?? classBlocks.error,
    refetch: () => {
      void slots.refetch()
      void classBlocks.refetch()
    },
  }
}

/* ------------------------------------------------------------------ *
 * Student side
 * ------------------------------------------------------------------ */

export interface BookRangeInput {
  day_of_week: Weekday
  start: string
  end: string
  student_id: string
  mode: BookingMode
}

export function useBookRange(weekStart: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: BookRangeInput): Promise<void> => {
      if (isSupabaseConfigured) {
        await bookSlot({
          week_start: weekStart,
          day_of_week: input.day_of_week,
          slot_start: input.start,
          slot_end: input.end,
          student_id: input.student_id,
          mode: input.mode,
        })
        return
      }
      await delay(300)
      const entry = getMockAllowlist().find((e) => e.student_id === input.student_id)
      if (!entry) {
        throw new Error('NOT_ALLOWLISTED')
      }
      if (input.day_of_week === 1 && input.mode !== 'online') {
        throw new Error('MONDAY_ONLINE_ONLY')
      }
      // Satu tempahan = satu baris dengan julat penuh.
      mockAddBooking({
        id: `demo-${Date.now()}`,
        week_start: weekStart,
        day_of_week: input.day_of_week,
        slot_start: input.start,
        slot_end: input.end,
        student_id: input.student_id,
        student_name: entry.name,
        mode: input.mode,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: weekSlotsKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: bookingsKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: bookingWeeksKey })
    },
  })
}

/* ------------------------------------------------------------------ *
 * Madam side (Mod madam)
 * ------------------------------------------------------------------ */

export function useBookings(weekStart: string, pin: string) {
  return useQuery({
    queryKey: bookingsKey(weekStart),
    queryFn: async (): Promise<Booking[]> => {
      if (isSupabaseConfigured) return fetchBookings(weekStart, pin)
      await delay(200)
      return ensureMockBookings(weekStart).filter((b) => b.week_start === weekStart)
    },
    enabled: Boolean(pin),
  })
}

/** Minggu (dalam kalangan yang diberi) yang ada tempahan aktif — untuk tab Mod madam. */
export function useBookingWeeks(weeks: string[]) {
  return useQuery({
    queryKey: [...bookingWeeksKey, ...weeks] as const,
    queryFn: async (): Promise<string[]> => {
      if (isSupabaseConfigured) return fetchBookingWeeks(weeks)
      await delay(150)
      if (weeks.length === 0) return []
      const active = ensureMockBookings(getCurrentWeekStart()).filter(
        (b) => weeks.includes(b.week_start) && (b.status === 'pending' || b.status === 'approved'),
      )
      return [...new Set(active.map((b) => b.week_start))]
    },
  })
}

export function useSetBookingStatus(weekStart: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      bookingId,
      status,
      pin,
    }: {
      bookingId: string
      status: 'approved' | 'rejected'
      pin: string
    }): Promise<void> => {
      if (isSupabaseConfigured) return setBookingStatus(bookingId, status, pin)
      await delay(200)
      if (pin !== MOCK_MADAM_PIN) throw new Error('UNAUTHORIZED')
      mockSetStatus(bookingId, status)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingsKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: weekSlotsKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: bookingWeeksKey })
    },
  })
}

export function useMadamVerify() {
  return useMutation({
    mutationFn: async (pin: string): Promise<boolean> => {
      if (isSupabaseConfigured) return madamVerify(pin)
      await delay(200)
      return pin === MOCK_MADAM_PIN
    },
  })
}

export function useAllowlist(pin: string) {
  return useQuery({
    queryKey: allowlistKey,
    queryFn: async (): Promise<AllowlistEntry[]> => {
      if (isSupabaseConfigured) return fetchAllowlist(pin)
      await delay(200)
      return getMockAllowlist()
    },
    enabled: Boolean(pin),
  })
}

export function useAddAllowlistEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      studentId,
      name,
      pin,
    }: {
      studentId: string
      name: string
      pin: string
    }): Promise<void> => {
      if (isSupabaseConfigured) return addAllowlistEntry(studentId, name, pin)
      await delay(200)
      if (pin !== MOCK_MADAM_PIN) throw new Error('UNAUTHORIZED')
      mockAddAllowlist(studentId, name)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: allowlistKey })
    },
  })
}

export function useRemoveAllowlistEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      studentId,
      pin,
    }: {
      studentId: string
      pin: string
    }): Promise<void> => {
      if (isSupabaseConfigured) return removeAllowlistEntry(studentId, pin)
      await delay(200)
      if (pin !== MOCK_MADAM_PIN) throw new Error('UNAUTHORIZED')
      mockRemoveAllowlist(studentId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: allowlistKey })
    },
  })
}

export function useAddExtraClass(weekStart: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      input,
      pin,
    }: {
      input: ExtraClassInput
      pin: string
    }): Promise<string> => {
      if (isSupabaseConfigured) return addExtraClass(input, pin)
      await delay(200)
      if (pin !== MOCK_MADAM_PIN) throw new Error('UNAUTHORIZED')
      const id = `ex-${Date.now()}`
      mockAddExtraClass({
        id,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        end_time: input.end_time,
        label: input.label,
        venue: input.venue,
        owner: 'madam',
        week_start: input.week_start,
      })
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: classBlocksKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: weekSlotsKey(weekStart) })
    },
  })
}

export function useRemoveExtraClass(weekStart: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }): Promise<void> => {
      if (isSupabaseConfigured) return removeExtraClass(id, pin)
      await delay(200)
      if (pin !== MOCK_MADAM_PIN) throw new Error('UNAUTHORIZED')
      mockRemoveExtraClass(id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: classBlocksKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: weekSlotsKey(weekStart) })
    },
  })
}

export function useClearWeekBookings(weekStart: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pin: string): Promise<void> => {
      if (isSupabaseConfigured) return clearWeekBookings(weekStart, pin)
      await delay(200)
      if (pin !== MOCK_MADAM_PIN) throw new Error('UNAUTHORIZED')
      mockClearWeekBookings(weekStart)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingsKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: weekSlotsKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: bookingWeeksKey })
    },
  })
}

export function useClearWeekExtraClasses(weekStart: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pin: string): Promise<void> => {
      if (isSupabaseConfigured) return clearWeekExtraClasses(weekStart, pin)
      await delay(200)
      if (pin !== MOCK_MADAM_PIN) throw new Error('UNAUTHORIZED')
      mockClearWeekExtraClasses(weekStart)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: classBlocksKey(weekStart) })
      void queryClient.invalidateQueries({ queryKey: weekSlotsKey(weekStart) })
    },
  })
}
