import { toast } from 'sonner'
import type { TranslationKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n'
import { useAllowlist, useBookings, useSetBookingStatus } from '@/lib/useSchedule'
import type { Booking, BookingStatus, Weekday } from '@/lib/types'

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

interface MadamPanelProps {
  weekStart: string
  pin: string
  onUnauthorized: () => void
}

function MadamPanel({ weekStart, pin, onUnauthorized }: MadamPanelProps) {
  const { t } = useI18n()
  const bookings = useBookings(weekStart)
  const allowlist = useAllowlist()
  const setStatus = useSetBookingStatus(weekStart)

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

  const fullNameById = new Map(
    (allowlist.data ?? []).map((entry) => [entry.student_id, entry.full_name]),
  )
  const displayName = (booking: Booking) =>
    fullNameById.get(booking.student_id) || booking.student_name

  // Pending di atas, selebihnya ikut susunan asal.
  const rows = [...(bookings.data ?? [])].sort(
    (a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1),
  )

  return (
    <div className="madmam-panel">
      {/* Tempahan minggu ini */}
      <section>
        <h3 className="meta" style={{ margin: '0 0 6px' }}>
          {t('weekBookings')}
        </h3>
        {bookings.isLoading ? (
          <p className="meta">{t('loading')}</p>
        ) : rows.length > 0 ? (
          <div>
            {rows.map((booking: Booking) => {
              const pending = booking.status === 'pending'
              return (
                <div key={booking.id} className="madmam-row">
                  <div>
                    <b style={{ fontWeight: 500 }}>
                      {displayName(booking)} <span className="meta">({booking.student_id})</span>
                    </b>
                    <div className="meta">
                      {t(DAY_FULL[booking.day_of_week])} · {fmtTime(booking.slot_start)} ·{' '}
                      {t(booking.mode === 'online' ? 'online' : 'inperson')}
                    </div>
                  </div>
                  {pending ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="pill ok"
                        disabled={setStatus.isPending}
                        onClick={() => void handleStatus(booking.id, 'approved')}
                      >
                        {t('approve')}
                      </button>
                      <button
                        type="button"
                        className="pill"
                        disabled={setStatus.isPending}
                        onClick={() => void handleStatus(booking.id, 'rejected')}
                      >
                        {t('reject')}
                      </button>
                    </div>
                  ) : (
                    <span className="meta">{t(STATUS_KEY[booking.status])}</span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="meta">{t('noBookings')}</p>
        )}
      </section>

      {/* Senarai pelajar seliaan (read-only) */}
      <section style={{ marginTop: 16 }}>
        <h3 className="meta" style={{ margin: '0 0 6px' }}>
          {t('supervisees')}
        </h3>
        {allowlist.isLoading ? (
          <p className="meta">{t('loading')}</p>
        ) : allowlist.data && allowlist.data.length > 0 ? (
          <div>
            {allowlist.data.map((entry) => (
              <div key={entry.id} className="madmam-row">
                <span>
                  {entry.full_name || entry.name}{' '}
                  <span className="meta">({entry.student_id})</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">{t('noAllowlist')}</p>
        )}
      </section>
    </div>
  )
}

export default MadamPanel
