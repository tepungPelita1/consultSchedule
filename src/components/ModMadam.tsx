import { useState } from 'react'
import { toast } from 'sonner'
import type { TranslationKey } from '@/lib/i18n'
import { interpolate, useI18n } from '@/lib/i18n'
import {
  useAllowlist,
  useBookingWeeks,
  useBookings,
  useClearWeekBookings,
  useClearWeekExtraClasses,
  useSetBookingStatus,
} from '@/lib/useSchedule'
import type { Booking, BookingStatus, Weekday } from '@/lib/types'
import { cn, weekNumber } from '@/lib/utils'

const DAY_FULL: Record<Weekday, TranslationKey> = {
  1: 'monFull',
  2: 'tueFull',
  3: 'wedFull',
  4: 'thuFull',
  5: 'friFull',
}

const STATUS_KEY: Record<BookingStatus, TranslationKey> = {
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
}

function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

/** Emoji haiwan untuk avatar — ikut kedudukan baris supaya setiap pelajar berbeza. */
const AVATARS = [
  '🐱', '🐶', '🐼', '🦊', '🐯', '🐨', '🐵', '🐸',
  '🐰', '🐻', '🦁', '🐧', '🐢', '🦉', '🐙', '🦄',
]

/** Ikon khas ikut student_id (override senarai haiwan). */
const AVATAR_OVERRIDES: Record<string, string> = {
  '2025229096': '👑', // SHU — Norshuaizam (crown/king)
  '2025228256': '🐹', // BQS — Balqis
}

function avatarFor(studentId: string, index: number): string {
  return AVATAR_OVERRIDES[studentId] ?? AVATARS[index % AVATARS.length]
}

interface MadamPanelProps {
  weekStart: string
  /** Tiga minggu boleh tempah: minggu semasa, +1, +2 (Isnin setiap satu). */
  weeks: string[]
  pin: string
  onUnauthorized: () => void
  onSelectWeek: (week: string) => void
}

function MadamPanel({ weekStart, weeks, pin, onUnauthorized, onSelectWeek }: MadamPanelProps) {
  const { t } = useI18n()
  const bookings = useBookings(weekStart)
  const bookingWeeks = useBookingWeeks(weeks)
  const allowlist = useAllowlist()
  const setStatus = useSetBookingStatus(weekStart)
  const clearBookings = useClearWeekBookings(weekStart)
  const clearAdhoc = useClearWeekExtraClasses(weekStart)

  const [confirming, setConfirming] = useState(false)
  const [resetText, setResetText] = useState('')
  const [showStudents, setShowStudents] = useState(false)

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : ''
    if (message.toUpperCase().includes('UNAUTHORIZED')) {
      onUnauthorized()
    } else {
      toast.error(t('errorMsg'))
    }
  }

  const handleStatus = async (bookingId: string, status: 'approved' | 'rejected') => {
    try {
      await setStatus.mutateAsync({ bookingId, status, pin })
      toast.success(t('updated'))
    } catch (err) {
      fail(err)
    }
  }

  const busy = clearBookings.isPending || clearAdhoc.isPending

  // Reset minggu: kosongkan tempahan + kelas ad-hoc. Sahkan dengan taip "reset".
  const handleReset = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    if (resetText.trim().toLowerCase() !== 'reset') return
    try {
      await clearBookings.mutateAsync(pin)
      await clearAdhoc.mutateAsync(pin)
      toast.success(t('resetDone'))
      setConfirming(false)
      setResetText('')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.toUpperCase().includes('UNAUTHORIZED')) {
        onUnauthorized()
      } else if (/COULD NOT FIND|DOES NOT EXIST|PGRST202|SCHEMA CACHE/i.test(message)) {
        toast.error(t('resetError'))
      } else {
        toast.error(t('errorMsg'))
      }
      console.error('[reset week]', err)
    }
  }

  const fullNameById = new Map(
    (allowlist.data ?? []).map((entry) => [entry.student_id, entry.full_name]),
  )
  const displayName = (booking: Booking) =>
    fullNameById.get(booking.student_id) || booking.student_name

  // Pending di atas, selebihnya ikut susunan asal.
  const rows = [...(bookings.data ?? [])].sort(
    (a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1),
  )

  // Tab minggu: papar minggu yang ada tempahan sahaja (serta minggu aktif semasa).
  const reserved = bookingWeeks.data ?? []
  const tabWeeks = reserved.length > 0
    ? weeks.filter((week) => reserved.includes(week) || week === weekStart)
    : []

  const weekTabLabel = (week: string) =>
    week === weeks[0]
      ? t('thisWeek')
      : interpolate(t('weekLabel'), { n: weekNumber(week) })

  return (
    <div className="madmam-panel">
      {/* Tiga minggu: tab muncul hanya jika ada tempahan */}
      {tabWeeks.length > 0 && (
        <div className="madam-tabs" role="tablist" aria-label={t('weekBookings')}>
          {tabWeeks.map((week) => {
            const active = week === weekStart
            return (
              <button
                key={week}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn('pill', active && 'active')}
                onClick={() => onSelectWeek(week)}
              >
                {weekTabLabel(week)}
              </button>
            )
          })}
        </div>
      )}

      {/* Tempahan minggu dipilih */}
      <section>
        <div className="madam-head">
          <h3 className="meta" style={{ margin: 0 }}>
            {t('weekBookings')}
          </h3>
          {rows.length > 0 && (
            <span className="meta" style={{ opacity: 0.6 }}>
              {interpolate(t('bookingsCount'), { n: rows.length })}
            </span>
          )}
        </div>
        {bookings.isLoading ? (
          <p className="meta">{t('loading')}</p>
        ) : rows.length > 0 ? (
          <div className="madam-grid">
            {rows.map((booking: Booking, index: number) => {
              const pending = booking.status === 'pending'
              return (
                <div
                  key={booking.id}
                  className={cn('madam-card', pending && 'is-pending')}
                >
                  <div className="madam-card-top">
                    <span className="avatar">{avatarFor(booking.student_id, index)}</span>
                    <div className="madam-card-who">
                      <b>{displayName(booking)}</b>
                      <span className="meta">{booking.student_id}</span>
                    </div>
                    <span
                      className={cn(
                        'madam-badge',
                        booking.status === 'pending' && 'is-pending',
                        booking.status === 'approved' && 'is-approved',
                        booking.status === 'rejected' && 'is-rejected',
                      )}
                    >
                      {t(STATUS_KEY[booking.status])}
                    </span>
                  </div>

                  <div className="madam-card-meta">
                    {t(DAY_FULL[booking.day_of_week])} · {fmtTime(booking.slot_start)} ·{' '}
                    {t(booking.mode === 'online' ? 'online' : 'inperson')}
                  </div>

                  {pending && (
                    <div className="madam-card-acts">
                      <button
                        type="button"
                        className="pill approve"
                        disabled={setStatus.isPending}
                        onClick={() => void handleStatus(booking.id, 'approved')}
                      >
                        ✓ {t('approve')}
                      </button>
                      <button
                        type="button"
                        className="pill reject"
                        disabled={setStatus.isPending}
                        onClick={() => void handleStatus(booking.id, 'rejected')}
                      >
                        ✕ {t('reject')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="meta">{t('noBookings')}</p>
        )}
      </section>

      {/* Senarai pelajar seliaan (tersembunyi sehingga ditekan) */}
      <section style={{ marginTop: 16 }}>
        <button
          type="button"
          className="pill"
          onClick={() => setShowStudents((value) => !value)}
          aria-expanded={showStudents}
        >
          {showStudents ? t('hideSupervisees') : t('showSupervisees')}
        </button>
        {showStudents && (
          <div style={{ marginTop: 10 }}>
            {allowlist.isLoading ? (
              <p className="meta">{t('loading')}</p>
            ) : allowlist.data && allowlist.data.length > 0 ? (
              <div className="supervisee">
                <table>
                  <thead>
                    <tr>
                      <th>{t('studentName')}</th>
                      <th>{t('studentId')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allowlist.data.map((entry, index) => (
                      <tr key={entry.id}>
                        <td>
                          <span className="who">
                            <span className="avatar">{avatarFor(entry.student_id, index)}</span>
                            <span>{entry.full_name || entry.name}</span>
                          </span>
                        </td>
                        <td>{entry.student_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="meta">{t('noAllowlist')}</p>
            )}
          </div>
        )}
      </section>

      {/* Urus minggu: reset (kosongkan tempahan + kelas ad-hoc) */}
      <section style={{ marginTop: 16 }}>
        <h3 className="meta" style={{ margin: '0 0 6px' }}>
          {t('manageWeek')}
        </h3>
        <button
          type="button"
          className="pill danger"
          disabled={busy}
          onClick={() => void handleReset()}
        >
          {t('clearWeek')}
        </button>
        {confirming && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <input
              type="text"
              value={resetText}
              onChange={(event) => setResetText(event.target.value)}
              placeholder={t('typeReset')}
              autoFocus
              style={{ flex: 1, minWidth: 140 }}
            />
            <button
              type="button"
              className="pill danger"
              disabled={busy || resetText.trim().toLowerCase() !== 'reset'}
              onClick={() => void handleReset()}
            >
              {t('confirm')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

export default MadamPanel
