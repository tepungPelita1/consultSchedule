// Papan markah konsultasi — logik ranking (leaderboard-spec.md §3).
// Dikongsi oleh mod Supabase & mod mock supaya susunan sentiasa sama.

/** Bilangan sesi hadir dalam minggu itu (0 = tak hadir); null = minggu belum selesai. */
export type WeekCount = number | null

export interface SeasonInfo {
  start_date: string // 'YYYY-MM-DD' (Isnin Minggu 1)
  length_weeks: number
  /** Nombor minggu semasa (1-based). < 1 = musim belum mula; > length = musim tamat. */
  current_week: number
}

/** Satu baris daripada RPC get_leaderboard (tiada student_id — privasi). */
export interface LeaderboardRow {
  key: string
  full_name: string
  short_name: string
  weeks: WeekCount[]
  /**
   * Slot konsultasi paling awal yang dah dikira ('YYYY-MM-DDTHH:mm:ss'),
   * atau null kalau belum ada. Tie-break terakhir: siapa sesinya dahulu.
   */
  first_slot_at: string | null
  booked_this_week: boolean
}

export interface LeaderboardData {
  season: SeasonInfo
  students: LeaderboardRow[]
}

export type Level = 'gold' | 'silver' | 'bronze'

export type WeekState = 'attended' | 'attended2' | 'missed' | 'booked' | 'current' | 'future'

export interface StudentStats extends LeaderboardRow {
  name: string
  color: string
  attended: number
  sessions: number
  best: number
  current: number
  level: Level
  rank: number
}

/** Palet pastel pelajar (§7). Teks di atasnya sentiasa gelap. */
export const STUDENT_COLORS = [
  '#9fd9a8',
  '#8fb8de',
  '#e6d98a',
  '#c9a6e4',
  '#8fd6cc',
  '#e8a0a0',
  '#f0b36e',
] as const

export const LEVEL_COLORS: Record<Level, string> = {
  gold: '#f2b134',
  silver: '#c9cfd6',
  bronze: '#d98f52',
}

export function computeStats(weeks: WeekCount[]): {
  attended: number
  sessions: number
  best: number
  current: number
} {
  let attended = 0
  let sessions = 0
  let best = 0
  let run = 0
  for (const w of weeks) {
    if (w === null) break // berhenti pada minggu pertama yang belum diputuskan
    if (w > 0) {
      attended++
      sessions += w
      run++
      best = Math.max(best, run)
    } else run = 0
  }
  let current = 0
  const done = weeks.filter((w): w is number => w !== null)
  for (let i = done.length - 1; i >= 0 && done[i] > 0; i--) current++
  return { attended, sessions, best, current }
}

type Rankable = Pick<StudentStats, 'attended' | 'best' | 'sessions' | 'name' | 'first_slot_at'>

/** Siapa sesinya lebih awal, dia di atas. Yang belum ada sesi turun ke bawah. */
export const compareFirstSlot = (a: Rankable, b: Rankable): number => {
  if (a.first_slot_at === b.first_slot_at) return 0
  if (!a.first_slot_at) return 1
  if (!b.first_slot_at) return -1
  return a.first_slot_at < b.first_slot_at ? -1 : 1
}

export const compareRank = (a: Rankable, b: Rankable): number =>
  b.attended - a.attended ||
  b.best - a.best ||
  b.sessions - a.sessions ||
  compareFirstSlot(a, b) ||
  a.name.localeCompare(b.name)

/** Minggu selesai = sebelum minggu semasa, dihadkan kepada panjang musim. */
export function completedWeeks(season: SeasonInfo): number {
  return Math.min(Math.max(season.current_week - 1, 0), season.length_weeks)
}

/**
 * Minggu yang dah masuk kiraan: minggu selesai, campur minggu semasa sebaik
 * ada sesi yang dah habis. Jadi penyebut untuk tahap & purata, supaya
 * `attended` tak boleh melebihi jumlah minggu yang dikira.
 */
export function scoredWeeks(data: LeaderboardData): number {
  const decided = data.students.reduce(
    (max, row) => Math.max(max, row.weeks.filter((w) => w !== null).length),
    0,
  )
  return Math.min(
    Math.max(completedWeeks(data.season), decided),
    data.season.length_weeks,
  )
}

export function levelFor(attended: number, completed: number): Level {
  if (completed <= 0) return 'bronze'
  const rate = attended / completed
  if (rate >= 0.8) return 'gold'
  if (rate >= 0.5) return 'silver'
  return 'bronze'
}

export function paceFor(attended: number, completed: number, length: number): number | null {
  if (completed <= 0) return null
  return Math.round((attended / completed) * length)
}

const NAME_PREFIXES = new Set([
  'MUHAMMAD', 'MUHAMAD', 'MUHD', 'MOHD', 'MOHAMMAD', 'MOHAMAD', 'MOHAMED', 'MOHAMMED', 'MD',
  'NUR', 'NOR', 'NURUL', 'NOOR', 'SITI', 'AHMAD', 'ABDUL', 'AB', 'WAN', 'NIK', 'MEGAT',
  'SYED', 'SHARIFAH', 'TENGKU', 'TUN', 'PUTERI', 'RAJA',
])

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()

/**
 * Nama panggilan daripada nama penuh Melayu: buang bahagian selepas BIN/BINTI
 * dan awalan biasa (Muhammad, Nur, …). cth. "MUHAMMAD FARID BIN HASSAN" → "Farid".
 */
export function nickname(fullName: string, fallback: string): string {
  const words = fullName.trim().toUpperCase().split(/\s+/).filter(Boolean)
  const cut = words.findIndex((w) => ['BIN', 'BINTI', 'BT', 'BT.', 'B.', 'A/L', 'A/P'].includes(w))
  const given = cut === -1 ? words : words.slice(0, cut)
  if (given.length === 0) return fallback
  let i = 0
  while (i < given.length - 1 && NAME_PREFIXES.has(given[i])) i++
  return titleCase(given[i])
}

/** Bina statistik + susunan ranking. Warna diberi ikut susunan kod pendek (stabil & unik). */
export function buildStandings(data: LeaderboardData): StudentStats[] {
  const completed = scoredWeeks(data)
  const byCode = [...data.students].sort((a, b) => a.short_name.localeCompare(b.short_name))
  const colorOf = new Map(
    byCode.map((row, i) => [row.key, STUDENT_COLORS[i % STUDENT_COLORS.length]] as const),
  )

  const stats = data.students.map((row) => {
    const s = computeStats(row.weeks)
    return {
      ...row,
      ...s,
      name: nickname(row.full_name, row.short_name),
      color: colorOf.get(row.key) ?? STUDENT_COLORS[0],
      level: levelFor(s.attended, completed),
      rank: 0,
    }
  })
  stats.sort(compareRank)
  stats.forEach((s, i) => (s.rank = i + 1))
  return stats
}

/** Keadaan setiap minggu (index 0-based) bagi seorang pelajar. */
export function weekState(row: LeaderboardRow, index: number, season: SeasonInfo): WeekState {
  const weekNo = index + 1
  const count = row.weeks[index]
  if (weekNo < season.current_week) {
    const n = count ?? 0
    return n >= 2 ? 'attended2' : n === 1 ? 'attended' : 'missed'
  }
  if (weekNo === season.current_week) {
    // Sesi minggu ini yang dah habis terus hijau. Kalau belum ada (null),
    // papar 'booked'/'current' — jangan cop 'missed' sebab minggu belum tamat.
    if (count != null && count > 0) return count >= 2 ? 'attended2' : 'attended'
    return row.booked_this_week ? 'booked' : 'current'
  }
  return 'future'
}

/** Penentu seri bagi baris gap: apa yang membezakan pelajar ini dengan pelajar di atas. */
export function gapReason(
  me: StudentStats,
  above: StudentStats,
):
  | { kind: 'weeks'; n: number }
  | { kind: 'streak' }
  | { kind: 'sessions' }
  | { kind: 'first' }
  | { kind: 'name' } {
  if (above.attended !== me.attended) return { kind: 'weeks', n: above.attended - me.attended }
  if (above.best !== me.best) return { kind: 'streak' }
  if (above.sessions !== me.sessions) return { kind: 'sessions' }
  if (compareFirstSlot(me, above) !== 0) return { kind: 'first' }
  return { kind: 'name' }
}
