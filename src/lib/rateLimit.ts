import { useEffect, useState } from 'react'

const STORAGE_PREFIX = 'csi.rl.' as const

export type LimitKey = 'student' | 'madam'

interface LimitState {
  fails: number
  lockedUntil: number
  lastFail: number
}

function readLimit(key: LimitKey): LimitState {
  if (typeof window === 'undefined') return { fails: 0, lockedUntil: 0, lastFail: 0 }
  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`)
  if (!raw) return { fails: 0, lockedUntil: 0, lastFail: 0 }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      'fails' in parsed &&
      'lockedUntil' in parsed &&
      typeof parsed.fails === 'number' &&
      typeof parsed.lockedUntil === 'number'
    ) {
      const value = parsed as { fails: number; lockedUntil: number; lastFail?: number }
      return {
        fails: value.fails,
        lockedUntil: value.lockedUntil,
        lastFail: typeof value.lastFail === 'number' ? value.lastFail : 0,
      }
    }
  } catch {
    // Abaikan data rosak.
  }
  return { fails: 0, lockedUntil: 0, lastFail: 0 }
}

function writeLimit(key: LimitKey, state: LimitState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(state))
}

export function remainingMs(key: LimitKey): number {
  const { lockedUntil } = readLimit(key)
  return Math.max(0, lockedUntil - Date.now())
}

export function isLocked(key: LimitKey): boolean {
  return remainingMs(key) > 0
}

/** Cubaan salah lama dari tempoh ni dianggap "session baharu" dan dikira semula. */
const FAIL_WINDOW_MS = 15 * 60 * 1000

export function recordFail(key: LimitKey, maxFails: number, lockMs: number): LimitState {
  const state = readLimit(key)
  const now = Date.now()
  let fails = state.fails
  let lockedUntil = state.lockedUntil

  // Reset kiraan hanya bila lock dah tamat DAN lama tak cuba.
  if (lockedUntil <= now && now - state.lastFail > FAIL_WINDOW_MS) {
    fails = 0
    lockedUntil = 0
  }

  fails += 1

  if (fails >= maxFails) {
    lockedUntil = now + lockMs
    fails = 0 // mula semula selepas lock tamat
  }

  const next: LimitState = { fails, lockedUntil, lastFail: now }
  writeLimit(key, next)
  return next
}

export function resetLimit(key: LimitKey): void {
  writeLimit(key, { fails: 0, lockedUntil: 0, lastFail: 0 })
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${pad2(s)}`
}

export function useLockCountdown(key: LimitKey): {
  locked: boolean
  remaining: number
  text: string
} {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const state = readLimit(key)
  const remaining = Math.max(0, state.lockedUntil - now)
  return {
    locked: remaining > 0,
    remaining,
    text: formatCountdown(remaining),
  }
}
