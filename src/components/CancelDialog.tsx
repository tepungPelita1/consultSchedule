import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { HAPTIC, haptic, hapticWithFallback } from '@/lib/haptic'
import type { TranslationKey } from '@/lib/i18n'
import { interpolate, useI18n } from '@/lib/i18n'
import { formatCountdown, isLocked, recordFail, remainingMs, resetLimit, useLockCountdown } from '@/lib/rateLimit'
import { useCancelBooking } from '@/lib/useSchedule'
import { cn, errorText } from '@/lib/utils'
import type { WeekSlot, Weekday } from '@/lib/types'

const DAY_FULL: Record<Weekday, TranslationKey> = {
  1: 'monFull',
  2: 'tueFull',
  3: 'wedFull',
  4: 'thuFull',
  5: 'friFull',
}

const schema = z.object({
  studentId: z.string().regex(/^\d{10}$/),
})

type FormValues = z.infer<typeof schema>

function errorMessageKey(message: string): TranslationKey {
  const m = message.toUpperCase()
  if (m.includes('RATE_LIMITED')) return 'rateLimitedServer'
  if (m.includes('ALREADY_APPROVED')) return 'alreadyApproved'
  if (m.includes('INVALID_STUDENT_ID')) return 'invalidStudentId'
  if (m.includes('NOT_YOUR_BOOKING')) return 'notYourBooking'
  if (m.includes('BOOKING_NOT_FOUND')) return 'bookingNotFound'
  return 'errorMsg'
}

function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

interface CancelDialogProps {
  open: boolean
  slot: WeekSlot | null
  weekStart: string
  onClose: () => void
}

function CancelDialogBody({
  slot,
  weekStart,
  onClose,
}: {
  slot: WeekSlot
  weekStart: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const cancelBooking = useCancelBooking(weekStart)
  const [sent, setSent] = useState(false)
  const { locked, text } = useLockCountdown('student')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { studentId: '' },
  })

  const studentIdField = register('studentId')
  const validIdRef = useRef(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dayLabel = t(DAY_FULL[slot.day_of_week])
  const timeLabel = `${fmtTime(slot.slot_start)}`

  const onSubmit = handleSubmit(async (values) => {
    if (locked) return
    try {
      await cancelBooking.mutateAsync({
        dayOfWeek: slot.day_of_week,
        slotStart: slot.slot_start,
        studentId: values.studentId,
      })
      setSent(true)
      resetLimit('student')
      haptic(HAPTIC.action)
      toast.success(t('cancelled'))
    } catch (err) {
      const message = errorText(err)
      console.error('[cancel_booking]', err)
      const isWrong =
        message.toUpperCase().includes('NOT_YOUR_BOOKING') ||
        message.toUpperCase().includes('BOOKING_NOT_FOUND')
      if (isWrong) {
        recordFail('student', 3, 10 * 60 * 1000)
        if (isLocked('student')) {
          toast.error(interpolate(t('rateLimitedStudent'), { time: formatCountdown(remainingMs('student')) }))
        } else {
          toast.error(t(errorMessageKey(message)))
        }
      } else {
        toast.error(t(errorMessageKey(message)))
      }
    }
  })

  return (
    <div className="sheet" onClick={onClose}>
      <div
        className="folder mf"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="fin" style={{ ['--c' as string]: 'var(--peach)' }}>
          <span className="sq" />
          {sent ? (
            <div style={{ marginTop: 14 }}>
              <h2 id="cancel-title" style={{ margin: 0, fontWeight: 500, fontSize: 24 }}>
                {t('cancelled')}
              </h2>
              <div className="acts">
                <button type="button" className="pill ok" onClick={onClose}>
                  {t('close')}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
              <h2 id="cancel-title" style={{ margin: 0, fontWeight: 500, fontSize: 24 }}>
                {t('cancelTitle')}
              </h2>
              <p style={{ margin: '6px 0 14px' }}>
                {dayLabel} · {timeLabel}
              </p>
              <p className="meta" style={{ margin: '0 0 10px', textTransform: 'none', letterSpacing: '0.02em' }}>
                {t('cancelBody')}
              </p>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <span className="meta" style={{ display: 'block', marginBottom: 4 }}>
                  {t('studentId')}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  {...studentIdField}
                  onChange={(event) => {
                    studentIdField.onChange(event)
                    // Getaran sebaik Student ID cukup 10 digit.
                    const valid = /^\d{10}$/.test(event.target.value)
                    if (valid && !validIdRef.current) haptic(HAPTIC.tap)
                    validIdRef.current = valid
                  }}
                  placeholder={t('studentIdPlaceholder')}
                  autoFocus
                  maxLength={10}
                  disabled={locked}
                  className={cn(errors.studentId && 'border-red')}
                />
                {errors.studentId && (
                  <span className="meta" style={{ color: '#E5533D' }}>
                    {t('invalidStudentId')}
                  </span>
                )}
                {locked && (
                  <span className="meta" style={{ display: 'block', marginTop: 6, color: '#E5533D' }}>
                    {interpolate(t('rateLimitedStudent'), { time: text })}
                  </span>
                )}
              </label>

              <div className="acts">
                <button type="button" className="pill" onClick={onClose}>
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="pill ok"
                  disabled={cancelBooking.isPending || locked}
                  onClick={(event) => hapticWithFallback(HAPTIC.action, event.currentTarget)}
                >
                  {cancelBooking.isPending ? t('loading') : t('cancelConfirm')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function CancelDialog({ open, slot, weekStart, onClose }: CancelDialogProps) {
  if (!open || !slot) return null
  return (
    <CancelDialogBody
      key={`${slot.slot_start}-${slot.day_of_week}`}
      slot={slot}
      weekStart={weekStart}
      onClose={onClose}
    />
  )
}

export default CancelDialog
