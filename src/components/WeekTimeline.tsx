import { addDays, format, getDate, isSameDay, parseISO } from 'date-fns'
import { enUS, ms as msLocale } from 'date-fns/locale'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { HAPTIC, haptic, hapticWithFallback } from '@/lib/haptic'
import type { TranslationKey } from '@/lib/i18n'
import { interpolate, useI18n } from '@/lib/i18n'
import { cn, weekNumber } from '@/lib/utils'
import type { ClassBlock, FreeBlock, WeekSlot, Weekday } from '@/lib/types'
import { Cat } from './illustrations'

const DAY_SHORT: Record<Weekday, TranslationKey> = {
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
}

function ampm(hour: number): string {
  if (hour === 12) return '12 PM'
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtTime12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

const WORK_START = 8 * 60
const WORK_END = 18 * 60
const WORK_DURATION = WORK_END - WORK_START

// Sentuh: tempoh tahan untuk masuk mod slide, dan jarak masa double tap.
const LONG_PRESS_MS = 1500
const DOUBLE_TAP_MS = 500
const MOVE_CANCEL_PX = 10

const pct = (minutes: number): number => ((minutes - WORK_START) / WORK_DURATION) * 100
const widthPct = (duration: number): number => (duration / WORK_DURATION) * 100

/** Warna blok kelas pelajar — ikut kod subjek. */
const SUBJECT_COLORS: Record<string, string> = {
  ITT626: '#8FB8DE',
  ICT602: '#9FD8A6',
  CSP600: '#C9A9E0',
  LCC500: '#EAD98B',
  ITT593: '#E8A6A0',
  ITT550: '#8FD4CB',
  TAC501: '#F0B77A',
  PHI428: '#F2A6C0',
}

function subjectColor(label: string): string {
  const code = label.split(' · ')[0]
  return SUBJECT_COLORS[code] ?? '#D8CFC4'
}

interface FolderHeaderProps {
  weekStart: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

function FolderHeader({ weekStart, onPrev, onNext, onToday }: FolderHeaderProps) {
  const { t, lang } = useI18n()
  const locale = lang === 'ms' ? msLocale : enUS
  const monday = parseISO(weekStart)
  const title = format(monday, 'MMMM yyyy', { locale })
  const weekNo = weekNumber(weekStart)

  return (
    <header className="folder">
      <div className="fin" style={{ ['--c' as string]: 'var(--yellow)' }}>
        <span className="sq" />
        <Cat className="cat" />
        <h1 className="title">{title}</h1>
        <div className="hbot">
          <span className="meta">{t('headerMeta')}</span>
          <div className="nav">
            <button type="button" className="pill" onClick={onPrev} aria-label={t('prevWeek')}>
              ←
            </button>
            <button
              type="button"
              className="pill thisweek"
              onClick={onToday}
              aria-label={t('thisWeek')}
            >
              {weekNo >= 1 ? interpolate(t('weekLabel'), { n: weekNo }) : t('thisWeek')}
            </button>
            <button type="button" className="pill" onClick={onNext} aria-label={t('nextWeek')}>
              →
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

interface WeekTimelineProps {
  weekStart: string
  slots: WeekSlot[]
  classBlocks: ClassBlock[]
  madamMode: boolean
  onBook: (block: FreeBlock) => void
  onAddExtra: (block: FreeBlock) => void
  onRemoveExtra: (id: string) => void
  onCancelBooking: (slot: WeekSlot) => void
}

interface DragState {
  day: Weekday
  anchor: string
  current: string
}

function WeekTimeline({
  weekStart,
  slots,
  classBlocks,
  madamMode,
  onBook,
  onAddExtra,
  onRemoveExtra,
  onCancelBooking,
}: WeekTimelineProps) {
  const { t } = useI18n()
  const monday = parseISO(weekStart)
  const [today] = useState(() => new Date())

  const hourCells = Array.from({ length: 20 }, (_, i) => i)

  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)

  // Peranti sentuh: tap pertama "arm" slot (tunjuk +), double tap tempah,
  // tahan ~long press untuk slide pilih julat dan auto buka tempahan.
  const [armed, setArmed] = useState<{ day: Weekday; slot_start: string } | null>(null)
  const [holding, setHolding] = useState(false)
  const lastTapRef = useRef<{ day: Weekday; slot_start: string; at: number } | null>(null)
  const longPressRef = useRef<number | null>(null)
  const holdingRef = useRef(false)
  const suppressingClickRef = useRef(false)
  const touchStartRef = useRef<{ sx: number; sy: number; time: number; becomeDrag: boolean } | null>(null)

  const commitDrag = useCallback((next: DragState) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const finishTouchDrag = () => {
    const d = dragRef.current
    if (!d) return
    const min = d.anchor < d.current ? d.anchor : d.current
    const max = d.anchor > d.current ? d.anchor : d.current
    const block = { day_of_week: d.day, start: min, end: toTime(toMinutes(max) + 30) }
    dragRef.current = null
    if (madamMode) onAddExtra(block)
    else onBook(block)
    setDrag(null)
    setArmed(null)
  }

  const startTouchSingle = (slot: WeekSlot) => {
    if (madamMode) {
      setArmed(null)
      onAddExtra({ day_of_week: slot.day_of_week, start: slot.slot_start, end: slot.slot_end })
      return
    }
    onBook({ day_of_week: slot.day_of_week, start: slot.slot_start, end: slot.slot_end })
  }

  useEffect(() => { dragRef.current = drag }, [drag])

  const [tip, setTip] = useState<{
    title: string
    detail: string
    x: number
    y: number
  } | null>(null)

  const showTip = (
    event: ReactPointerEvent,
    data: { title: string; detail: string },
  ) => {
    if (event.pointerType !== 'mouse') return
    setTip({ ...data, x: event.clientX, y: event.clientY })
  }

  // Peranti sentuh: tap untuk tunjuk/mati tooltip nama penuh.
  const toggleTip = (
    event: ReactPointerEvent,
    data: { title: string; detail: string },
  ) => {
    if (event.pointerType === 'mouse') return
    setTip((current) =>
      current && current.title === data.title && current.detail === data.detail
        ? null
        : { ...data, x: event.clientX, y: event.clientY },
    )
  }

  useEffect(() => {
    dragRef.current = drag
  }, [drag])

  // Bersihkan timer long-press bila jari dilepas/dibatalkan.
  useEffect(() => {
    const clear = () => {
      if (longPressRef.current !== null) {
        window.clearTimeout(longPressRef.current)
        longPressRef.current = null
      }
    }
    window.addEventListener('pointerup', clear)
    window.addEventListener('pointercancel', clear)
    return () => {
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('pointercancel', clear)
    }
  }, [])

  // Mod slide (sentuh): gerakkan jari atas slot kosong untuk panjangkan julat.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !dragRef.current) return
      const el = document.elementFromPoint(event.clientX, event.clientY)
      const target = el instanceof HTMLElement ? el.closest<HTMLElement>('.blk.free') : null
      if (!target) return
      const day = Number(target.dataset.day) as Weekday
      const slotStart = target.dataset.slot
      if (!slotStart || !Number.isFinite(day)) return
      setDrag((d) => (d && d.day === day ? { ...d, current: slotStart } : d))
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // Buang "arm" selepas 5 saat, atau bila tekan di luar slot kosong.
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(null), 5000)
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.blk.free')) return
      setArmed(null)
    }
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [armed])

  const isPast = (day: Weekday, start: string): boolean => {
    const date = addDays(monday, day - 1)
    const [h, m] = start.split(':').map(Number)
    const slotEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m + 30)
    return slotEnd <= today
  }

  const nowPosition = (day: Weekday): number | null => {
    const date = addDays(monday, day - 1)
    if (!isSameDay(date, today)) return null
    const minutes = today.getHours() * 60 + today.getMinutes()
    if (minutes < WORK_START || minutes >= WORK_END) return null
    return pct(minutes)
  }


  const extendDrag = (slot: WeekSlot) => {
    setDrag((d) =>
      d && d.day === slot.day_of_week ? { ...d, current: slot.slot_start } : d,
    )
  }

  useEffect(() => {
    const finish = () => {
      const d = dragRef.current
      if (!d) return
      const min = d.anchor < d.current ? d.anchor : d.current
      const max = d.anchor > d.current ? d.anchor : d.current
      const block = { day_of_week: d.day, start: min, end: toTime(toMinutes(max) + 30) }
      dragRef.current = null
      if (madamMode) onAddExtra(block)
      else onBook(block)
      setDrag(null)
    }
    const cancel = () => setDrag(null)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [onBook, onAddExtra, madamMode])

  const dragRange = (day: Weekday): [string, string] | null => {
    if (!drag || drag.day !== day) return null
    const min = drag.anchor < drag.current ? drag.anchor : drag.current
    const max = drag.anchor > drag.current ? drag.anchor : drag.current
    return [min, max]
  }

  return (
    <div className="board">
      <div className="tl">
        {/* hour header */}
        <div className="row">
          <div className="dl" />
          <div className="hrs">
            {hourCells.map((i) => (
              <span key={i} className={cn('meta', i % 2 !== 0 && 'invisible')}>
                {i % 2 === 0 ? ampm(8 + i / 2) : ''}
              </span>
            ))}
            <span className="meta end" aria-hidden="true">
              6 PM
            </span>
          </div>
        </div>

        {/* day rows */}
        {([1, 2, 3, 4, 5] as Weekday[]).map((day) => {
          const date = addDays(monday, day - 1)
          const isToday = isSameDay(date, today)
          const dayClasses = classBlocks.filter((c) => c.day_of_week === day)
          const madamClasses = dayClasses.filter((c) => c.owner !== 'student')
          const studentClasses = dayClasses.filter((c) => c.owner === 'student')
          const twoLane = madamClasses.length > 0 && studentClasses.length > 0
          const bookedSlots = slots.filter(
            (s) =>
              s.day_of_week === day && (s.status === 'pending' || s.status === 'approved'),
          )
          const freeSlots = slots.filter(
            (s) => s.day_of_week === day && s.status === 'available',
          )
          const nowPct = nowPosition(day)
          const range = dragRange(day)

          return (
            <div key={day} className={cn('row', isToday && 'today', twoLane ? 'two-lane' : 'one-lane')}>
              <div className="dl">
                <span className="meta">{t(DAY_SHORT[day])}</span>
                <b>{getDate(date)}</b>
              </div>
              <div className={cn('trk', twoLane && 'two-lane')}>
                {[
                  ...madamClasses.map((block) => ({ block, student: false })),
                  ...studentClasses.map((block) => ({ block, student: true })),
                ].map(({ block, student }) => {
                  const left = pct(toMinutes(block.start_time))
                  const width = widthPct(toMinutes(block.end_time) - toMinutes(block.start_time))
                  const isAdhoc = block.week_start != null
                  const canRemove = isAdhoc && madamMode
                  const laneClass = twoLane ? (student ? 'lane-bottom' : 'lane-top') : undefined

                  const style = {
                    left: `${left}%`,
                    width: `${width}%`,
                    ...(student ? { background: subjectColor(block.label) } : null),
                  }

                  const content = (
                    <>
                      <b>{isAdhoc ? block.label || t('adhocLabel') : block.label || t('legendClass')}</b>
                      <span className="meta">
                        {fmtTime12(block.start_time)}
                        {block.venue ? ` · ${block.venue}` : ''}
                        {canRemove ? ` · ${t('removeClass')}` : ''}
                      </span>
                    </>
                  )

                  const className = cn(
                    'blk kelas',
                    isAdhoc && 'extra',
                    laneClass,
                    student && 'std',
                  )

                  const tipData = {
                    title: t(student ? 'tipStudentClass' : 'tipMadamClass'),
                    detail: `${block.label} · ${fmtTime12(block.start_time)}${
                      block.venue ? ` · ${block.venue}` : ''
                    }`,
                  }

                  if (canRemove) {
                    return (
                      <button
                        key={block.id}
                        type="button"
                        className={className}
                        style={style}
                        onClick={() => onRemoveExtra(block.id)}
                        onPointerEnter={(event) => showTip(event, tipData)}
                        onPointerLeave={() => setTip(null)}
                      >
                        {content}
                      </button>
                    )
                  }

                  return (
                    <div
                      key={block.id}
                      className={className}
                      style={style}
                      onPointerEnter={(event) => showTip(event, tipData)}
                      onPointerLeave={() => setTip(null)}
                    >
                      {content}
                    </div>
                  )
                })}

                {bookedSlots.map((slot) => {
                  const left = pct(toMinutes(slot.slot_start))
                  const pending = slot.status === 'pending'
                  const content = (
                    <>
                      <b>{slot.student_name ?? t(pending ? 'statusPending' : 'statusApproved')}</b>
                      <span className="meta">
                        {fmtTime12(slot.slot_start)}
                        {pending ? ` · ${t('statusPending')}` : ' ✓'}
                      </span>
                    </>
                  )
                  if (madamMode) {
                    return (
                      <div
                        key={slot.booking_id ?? `${slot.slot_start}`}
                        className={cn('blk', pending ? 'booked-pending' : 'booked')}
                        style={{ left: `${left}%`, width: `${widthPct(30)}%` }}
                        aria-label={`${slot.student_full_name || slot.student_name || ''} ${fmtTime12(slot.slot_start)}`}
                        onPointerEnter={(event) =>
                          showTip(event, {
                            title: slot.student_full_name || slot.student_name || '—',
                            detail: `${fmtTime12(slot.slot_start)}${
                              slot.mode
                                ? ` · ${t(slot.mode === 'online' ? 'online' : 'inperson')}`
                                : ''
                            }`,
                          })
                        }
                        onPointerUp={(event) =>
                          toggleTip(event, {
                            title: slot.student_full_name || slot.student_name || '—',
                            detail: `${fmtTime12(slot.slot_start)}${
                              slot.mode
                                ? ` · ${t(slot.mode === 'online' ? 'online' : 'inperson')}`
                                : ''
                            }`,
                          })
                        }
                        onPointerLeave={() => setTip(null)}
                      >
                        {content}
                      </div>
                    )
                  }
                  return (
                    <button
                      key={slot.booking_id ?? `${slot.slot_start}`}
                      type="button"
                      className={cn('blk', pending ? 'booked-pending' : 'booked')}
                      style={{ left: `${left}%`, width: `${widthPct(30)}%` }}
                      aria-label={`${slot.student_full_name || slot.student_name || ''} ${fmtTime12(slot.slot_start)}`}
                      onClick={() => onCancelBooking(slot)}
                      onPointerEnter={(event) =>
                        showTip(event, {
                          title: slot.student_full_name || slot.student_name || '—',
                          detail: `${fmtTime12(slot.slot_start)}${
                            slot.mode
                              ? ` · ${t(slot.mode === 'online' ? 'online' : 'inperson')}`
                              : ''
                          }`,
                        })
                      }
                      onPointerLeave={() => setTip(null)}
                    >
                      {content}
                    </button>
                  )
                })}

                {freeSlots.map((slot) => {
                  const left = pct(toMinutes(slot.slot_start))
                  const gone = isPast(day, slot.slot_start)
                  if (gone) {
                    return (
                      <div
                        key={slot.slot_start}
                        className="blk gone"
                        style={{ left: `${left}%`, width: `${widthPct(30)}%` }}
                      />
                    )
                  }
                  const selected =
                    range !== null && slot.slot_start >= range[0] && slot.slot_start <= range[1]
                  const isArmed =
                    armed !== null && armed.day === day && armed.slot_start === slot.slot_start
                  return (
                    <button
                      key={slot.slot_start}
                      type="button"
                      className={cn('blk free', selected && 'drag-sel', isArmed && 'armed')}
                      style={{ left: `${left}%`, width: `${widthPct(30)}%` }}
                      data-day={day}
                      data-slot={slot.slot_start}
                      aria-label={`${t('bookSlot')} ${slot.slot_start}`}
                      onContextMenu={(event) => event.preventDefault()}
                      onPointerDown={(event) => {
                        if (event.pointerType === 'mouse') {
                          commitDrag({ day, anchor: slot.slot_start, current: slot.slot_start })
                        }
                      }}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== 'touch') extendDrag(slot)
                      }}
                      // Sentuh: long press + slide
                      onTouchStart={(event) => {
                        suppressingClickRef.current = false
                        const touch = event.touches[0]
                        touchStartRef.current = { sx: touch.clientX, sy: touch.clientY, time: Date.now(), becomeDrag: false }
                        if (longPressRef.current !== null) {
                          window.clearTimeout(longPressRef.current)
                          longPressRef.current = null
                        }
                        holdingRef.current = true
                        setHolding(true)
                        longPressRef.current = window.setTimeout(() => {
                          longPressRef.current = null
                          const info = touchStartRef.current
                          if (!info) return
                          info.becomeDrag = true
                          setArmed(null)
                          haptic(HAPTIC.longPress)
                          commitDrag({ day, anchor: slot.slot_start, current: slot.slot_start })
                          holdingRef.current = false
                          setHolding(false)
                        }, LONG_PRESS_MS)
                      }}
                      onTouchMove={(event) => {
                        const info = touchStartRef.current
                        if (!info) return
                        const touch = event.touches[0]
                        const dx = Math.abs(touch.clientX - info.sx)
                        const dy = Math.abs(touch.clientY - info.sy)
                        if (info.becomeDrag) {
                          const el = document.elementFromPoint(touch.clientX, touch.clientY)
                          const target = el instanceof HTMLElement ? el.closest<HTMLElement>('.blk.free') : null
                          if (target) {
                            const d2 = Number(target.dataset.day)
                            const ss = target.dataset.slot
                            if (ss && Number.isFinite(d2)) {
                              const cur = dragRef.current
                              if (cur && cur.day === d2) commitDrag({ ...cur, current: ss })
                            }
                          }
                          return
                        }
                        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
                          if (longPressRef.current !== null) {
                            window.clearTimeout(longPressRef.current)
                            longPressRef.current = null
                          }
                          holdingRef.current = false
                          setHolding(false)
                          info.becomeDrag = false
                        }
                      }}
                      onTouchEnd={() => {
                        const info = touchStartRef.current
                        const becameDrag = !!info?.becomeDrag
                        if (longPressRef.current !== null) {
                          window.clearTimeout(longPressRef.current)
                          longPressRef.current = null
                        }
                        holdingRef.current = false
                        setHolding(false)
                        touchStartRef.current = null
                        if (becameDrag) {
                          finishTouchDrag()
                          suppressingClickRef.current = true
                        }
                      }}
                      onTouchCancel={() => {
                        if (longPressRef.current !== null) {
                          window.clearTimeout(longPressRef.current)
                          longPressRef.current = null
                        }
                        holdingRef.current = false
                        setHolding(false)
                        touchStartRef.current = null
                        dragRef.current = null
                        setDrag(null)
                      }}
                      onClick={(event) => {
                        if (event.detail === 0 && !(event as React.MouseEvent).isTrusted) return
                        const isTouchBrowser =
                          typeof window !== 'undefined' &&
                          ((window.matchMedia?.('(hover: none)').matches ?? false) ||
                           (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
                           (navigator.maxTouchPoints > 0))
                        if (suppressingClickRef.current) {
                          suppressingClickRef.current = false
                          return
                        }
                        if (!isTouchBrowser) return
                        const now = Date.now()
                        const last = lastTapRef.current
                        const isDouble =
                          last !== null &&
                          last.day === day &&
                          last.slot_start === slot.slot_start &&
                          now - last.at < DOUBLE_TAP_MS
                        if (isDouble || (isArmed && !holding)) {
                          lastTapRef.current = null
                          setArmed(null)
                          hapticWithFallback(HAPTIC.action, event.currentTarget)
                          startTouchSingle(slot)
                          return
                        }
                        setArmed({ day, slot_start: slot.slot_start })
                        lastTapRef.current = { day, slot_start: slot.slot_start, at: now }
                        hapticWithFallback(HAPTIC.tap, event.currentTarget)
                      }}

                    >
                      +
                    </button>
                  )
                })}

                {nowPct !== null && <div className="now" style={{ left: `${nowPct}%` }} />}
              </div>
            </div>
          )
        })}
      </div>

      {tip && (
        <div className="slot-tip" style={{ left: tip.x, top: tip.y }}>
          <b>{tip.title}</b>
          <div>{tip.detail}</div>
        </div>
      )}
    </div>
  )
}

export { FolderHeader, WeekTimeline }
