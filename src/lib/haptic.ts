// Getaran peranti (Vibration API).
// Sokongan: Android Chrome/Firefox. iOS Safari TIDAK menyokong — tiada jalan.
// Chrome Android perlukan "sticky user activation": getaran mesti dipanggil
// dalam tindak balas interaksi pengguna (tap/pointer), bukan sebelum sebarang tap.
// Guna pola berganda supaya jelas terasa (denyut pendek tunggal sering diabaikan).

type HapticPattern = number | readonly number[]

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** Denyut getaran. Kembalikan true kalau API terima permintaan. */
export function haptic(pattern: HapticPattern = [30]): boolean {
  if (!canVibrate()) return false
  try {
    return navigator.vibrate(pattern as number | number[]) === true
  } catch {
    return false
  }
}

/**
 * Getaran + fallback visual: kalau API getaran tak tersedia/gagal, denyutkan
 * elemen sekejap supaya pengguna tetap dapat maklum balas.
 */
export function hapticWithFallback(pattern: HapticPattern, el?: Element | null): boolean {
  const ok = haptic(pattern)
  if (!ok && el instanceof HTMLElement) {
    el.classList.remove('haptic-pulse')
    void el.offsetWidth
    el.classList.add('haptic-pulse')
    window.setTimeout(() => el.classList.remove('haptic-pulse'), 320)
  }
  return ok
}

/** Pola getaran standard — berganda supaya lebih ketara. */
export const HAPTIC = {
  /** sentuh ringan / slot di-arm */
  tap: [15, 30, 15],
  /** tempah / pilih slot (klik atau double tap) */
  action: [45, 40, 45],
  /** long-press mula-menarik / tambah kelas ad-hoc */
  longPress: [60, 40, 60],
} as const
