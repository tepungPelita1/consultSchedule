import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { HAPTIC, haptic, hapticWithFallback } from '@/lib/haptic'
import type { TranslationKey } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n'
import { useBookRange } from '@/lib/useSchedule'
import { cn, errorText } from '@/lib/utils'
import type { FreeBlock, Weekday } from '@/lib/types'

interface BookingDialogProps {
  open: boolean
  block: FreeBlock | null
  weekStart: string
  onClose: () => void
}

const DAY_FULL: Record<Weekday, TranslationKey> = {
  1: 'monFull',
  2: 'tueFull',
  3: 'wedFull',
  4: 'thuFull',
  5: 'friFull',
}

const schema = z.object({
  studentId: z.string().regex(/^\d{10}$/),
  mode: z.enum(['inperson', 'online']),
})

type FormValues = z.infer<typeof schema>

function errorMessageKey(message: string): TranslationKey {
  const m = message.toUpperCase()
  if (m.includes('NOT_ALLOWLISTED')) return 'notAllowlisted'
  if (m.includes('SLOT_TAKEN')) return 'slotTaken'
  if (m.includes('DAILY_LIMIT')) return 'dailyLimit'
  if (m.includes('WRONG_WEEK')) return 'wrongWeek'
  if (m.includes('CLASS_TIME')) return 'classTime'
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

interface BookingDialogBodyProps {
  block: FreeBlock
  weekStart: string
  onClose: () => void
}

function BookingDialogBody({ block, weekStart, onClose }: BookingDialogBodyProps) {
  const { t } = useI18n()
  const bookRange = useBookRange(weekStart)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { studentId: '', mode: 'inperson' },
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

  const dayLabel = t(DAY_FULL[block.day_of_week])
  const timeRange = `${fmtTime(block.start)} – ${fmtTime(block.end)}`

  const onSubmit = handleSubmit(async (values) => {
    try {
      await bookRange.mutateAsync({
        day_of_week: block.day_of_week,
        start: block.start,
        end: block.end,
        student_id: values.studentId,
        mode: values.mode,
      })
      setSent(true)
      haptic(HAPTIC.action)
      toast.success(t('bookingSent'))
    } catch (err) {
      const message = errorText(err)
      console.error('[book_slot]', err)
      toast.error(t(errorMessageKey(message)))
    }
  })

  return (
    <div className="sheet" onClick={onClose}>
      <div
        className="folder mf"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="fin" style={{ ['--c' as string]: 'var(--peach)' }}>
          <span className="sq" />
          {sent ? (
            <div style={{ marginTop: 14 }}>
              <h2 id="booking-title" style={{ margin: 0, fontWeight: 500, fontSize: 24 }}>
                {t('successTitle')}
              </h2>
              <p style={{ margin: '6px 0 14px' }}>{t('successBody')}</p>
              <div className="acts">
                <button type="button" className="pill ok" onClick={onClose}>
                  {t('close')}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
              <h2 id="booking-title" style={{ margin: 0, fontWeight: 500, fontSize: 24 }}>
                {dayLabel}
              </h2>
              <p style={{ margin: '6px 0 14px' }}>{timeRange}</p>

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
                  className={cn(errors.studentId && 'border-red')}
                />
                <span className="meta" style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
                  {t('studentIdHint')}
                </span>
                {errors.studentId && (
                  <span className="meta" style={{ color: '#E5533D' }}>
                    {t('invalidStudentId')}
                  </span>
                )}
              </label>

              <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
                <legend className="meta" style={{ marginBottom: 6 }}>
                  {t('mode')}
                </legend>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label
                    className="pill"
                    style={{ cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' }}
                  >
                    <input
                      type="radio"
                      value="inperson"
                      {...register('mode')}
                      onClick={(event) => hapticWithFallback(HAPTIC.tap, event.currentTarget)}
                    />
                    {t('inperson')}
                  </label>
                  <label
                    className="pill"
                    style={{ cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' }}
                  >
                    <input
                      type="radio"
                      value="online"
                      {...register('mode')}
                      onClick={(event) => hapticWithFallback(HAPTIC.tap, event.currentTarget)}
                    />
                    {t('online')}
                  </label>
                </div>
              </fieldset>

              <div className="acts">
                <button type="button" className="pill" onClick={onClose}>
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="pill ok"
                  disabled={bookRange.isPending}
                  onClick={(event) => hapticWithFallback(HAPTIC.action, event.currentTarget)}
                >
                  {bookRange.isPending ? t('loading') : t('submit')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function BookingDialog({ open, block, weekStart, onClose }: BookingDialogProps) {
  if (!open || !block) return null
  return (
    <BookingDialogBody
      key={`${block.day_of_week}-${block.start}-${block.end}`}
      block={block}
      weekStart={weekStart}
      onClose={onClose}
    />
  )
}

export default BookingDialog
