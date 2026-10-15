import { useState } from 'react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'
import type { TranslationKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n'
import {
  useAddAllowlistEntry,
  useAllowlist,
  useBookings,
  useRemoveAllowlistEntry,
  useSetBookingStatus,
} from '@/lib/useSchedule'
import type { Booking, Weekday } from '@/lib/types'

const DAY_FULL: Record<Weekday, TranslationKey> = {
  1: 'monFull',
  2: 'tueFull',
  3: 'wedFull',
  4: 'thuFull',
  5: 'friFull',
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
  const addEntry = useAddAllowlistEntry()
  const removeEntry = useRemoveAllowlistEntry()

  const [studentId, setStudentId] = useState('')
  const [name, setName] = useState('')

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

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    const id = studentId.trim()
    const studentName = name.trim()
    if (!id || !studentName) return
    if (!/^\d{10}$/.test(id)) {
      toast.error(t('invalidStudentId'))
      return
    }
    try {
      await addEntry.mutateAsync({ studentId: id, name: studentName, pin })
      toast.success(t('added'))
      setStudentId('')
      setName('')
    } catch (err) {
      fail(err)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await removeEntry.mutateAsync({ studentId: id, pin })
      toast.success(t('removed'))
    } catch (err) {
      fail(err)
    }
  }

  const pending = bookings.data?.filter((b) => b.status === 'pending') ?? []

  const fullNameById = new Map(
    (allowlist.data ?? []).map((entry) => [entry.student_id, entry.full_name]),
  )
  const displayName = (booking: Booking) =>
    fullNameById.get(booking.student_id) || booking.student_name

  return (
    <div className="madmam-panel">
      {/* Tempahan menunggu */}
      <section>
        <h3 className="meta" style={{ margin: '0 0 6px' }}>
          {t('weekBookings')}
        </h3>
        {bookings.isLoading ? (
          <p className="meta">{t('loading')}</p>
        ) : pending.length > 0 ? (
          <div>
            {pending.map((booking: Booking) => (
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
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="pill"
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
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">{t('noBookings')}</p>
        )}
      </section>

      {/* Senarai pelajar */}
      <section style={{ marginTop: 16 }}>
        <h3 className="meta" style={{ margin: '0 0 6px' }}>
          {t('allowlist')}
        </h3>
        <form
          onSubmit={handleAdd}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}
        >
          <input
            type="text"
            inputMode="numeric"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder={t('studentIdPlaceholder')}
            style={{ flex: '0 0 140px' }}
          />
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('studentNamePlaceholder')}
            style={{ flex: 1, minWidth: 140 }}
          />
          <button
            type="submit"
            className="pill ok"
            disabled={addEntry.isPending || !studentId.trim() || !name.trim()}
          >
            {t('add')}
          </button>
        </form>

        {allowlist.isLoading ? (
          <p className="meta">{t('loading')}</p>
        ) : allowlist.data && allowlist.data.length > 0 ? (
          <div>
            {allowlist.data.map((entry) => (
              <div key={entry.id} className="madmam-row">
                <span>
                  {entry.name} <span className="meta">({entry.student_id})</span>
                </span>
                <button
                  type="button"
                  className="pill"
                  disabled={removeEntry.isPending}
                  onClick={() => void handleRemove(entry.student_id)}
                >
                  {t('remove')}
                </button>
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
