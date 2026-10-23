import { addDays, format, parseISO } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'
import BookingDialog from '@/components/BookingDialog'
import CancelDialog from '@/components/CancelDialog'
import LangToggle from '@/components/LangToggle'
import MadamGate from '@/components/MadamGate'
import MadamPanel from '@/components/ModMadam'
import { FolderHeader, WeekTimeline } from '@/components/WeekTimeline'
import { interpolate, useI18n } from '@/lib/i18n'
import { getBookableWeeks, getCurrentWeekStart, getMaxBookableWeekStart } from '@/lib/slots'
import { useAddExtraClass, useRemoveExtraClass, useWeekView } from '@/lib/useSchedule'
import type { FreeBlock, WeekSlot } from '@/lib/types'
import { weekRangeLabel } from '@/lib/utils'

function SchedulePage() {
  const { t, lang } = useI18n()
  const currentWeekStart = getCurrentWeekStart()
  const maxWeekStart = getMaxBookableWeekStart()
  const bookableWeeks = getBookableWeeks()
  const [weekStart, setWeekStart] = useState<string>(currentWeekStart)
  const [madamMode, setMadamMode] = useState<boolean>(() =>
    Boolean(sessionStorage.getItem('csi.madamPin')),
  )
  const [madamPin, setMadamPin] = useState<string>(
    () => sessionStorage.getItem('csi.madamPin') ?? '',
  )
  const [gateOpen, setGateOpen] = useState(false)
  const [selected, setSelected] = useState<FreeBlock | null>(null)
  const [cancelSlot, setCancelSlot] = useState<WeekSlot | null>(null)

  const { slots, classBlocks, isLoading, error, refetch } = useWeekView(weekStart)
  const addExtra = useAddExtraClass(weekStart)
  const removeExtra = useRemoveExtraClass(weekStart)

  const freeCount = slots.filter((s) => s.status === 'available').length

  const shift = (days: number) => {
    const next = format(addDays(parseISO(weekStart), days), 'yyyy-MM-dd')
    // Had tempahan: minggu semasa hingga +2 minggu sahaja.
    if (next < currentWeekStart || next > maxWeekStart) return
    setWeekStart(next)
  }

  const handleUnauthorized = () => {
    setMadamMode(false)
    setMadamPin('')
    sessionStorage.removeItem('csi.madamPin')
    toast.error(t('unauthorized'))
  }

  const toggleMadam = (next: boolean) => {
    if (next) {
      setGateOpen(true)
      return
    }
    setMadamMode(false)
    setMadamPin('')
    sessionStorage.removeItem('csi.madamPin')
  }

  const handleGateSuccess = (pin: string) => {
    setMadamPin(pin)
    setMadamMode(true)
    sessionStorage.setItem('csi.madamPin', pin)
    toast.success(t('madamActive'))
  }

  const handleAddExtra = async (block: FreeBlock) => {
    try {
      await addExtra.mutateAsync({
        input: {
          day_of_week: block.day_of_week,
          start_time: block.start,
          end_time: block.end,
          label: t('adhocLabel'),
          venue: '',
          week_start: weekStart,
        },
        pin: madamPin,
      })
      toast.success(t('extraAdded'))
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.toUpperCase().includes('UNAUTHORIZED')) handleUnauthorized()
      else toast.error(t('errorMsg'))
    }
  }

  const handleRemoveExtra = async (id: string) => {
    try {
      await removeExtra.mutateAsync({ id, pin: madamPin })
      toast.success(t('extraRemoved'))
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.toUpperCase().includes('UNAUTHORIZED')) handleUnauthorized()
      else toast.error(t('errorMsg'))
    }
  }

  return (
    <div
      className="wrap"
      style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 48px' }}
    >
      <FolderHeader
        weekStart={weekStart}
        canPrev={weekStart > currentWeekStart}
        canNext={weekStart < maxWeekStart}
        onPrev={() => shift(-7)}
        onNext={() => shift(7)}
        onToday={() => setWeekStart(currentWeekStart)}
      />

      <div className="weekbar">
        <div>
          <h2>{weekRangeLabel(weekStart, lang)}</h2>
          <span className="meta" style={{ letterSpacing: '0.02em', textTransform: 'none' }}>
            {t('bookingWindow')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="legend">
            <span>
              <i className="sw f" />
              {t('legendFree')}
            </span>
            <span>
              <i className="sw k" />
              {t('legendMadam')}
            </span>
            <span>
              <i className="sw s" />
              {t('legendStudent')}
            </span>
            <span>
              <i className="sw ad" />
              {t('legendAdhoc')}
            </span>
            <span>
              <i className="sw bp" />
              {t('statusPending')}
            </span>
            <span>
              <i className="sw b" />
              {t('booked')}
            </span>
          </div>
          <LangToggle />
        </div>
      </div>

      {isLoading ? (
        <p className="meta" style={{ padding: '40px 0', textAlign: 'center' }}>
          {t('loading')}
        </p>
      ) : error ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p className="meta">{t('errorMsg')}</p>
          <button type="button" className="pill" onClick={() => void refetch()}>
            {t('retry')}
          </button>
        </div>
      ) : (
        <WeekTimeline
          weekStart={weekStart}
          slots={slots}
          classBlocks={classBlocks}
          madamMode={madamMode}
          onBook={setSelected}
          onAddExtra={(block) => void handleAddExtra(block)}
          onRemoveExtra={(id) => void handleRemoveExtra(id)}
          onCancelBooking={setCancelSlot}
        />
      )}

      <div className="hint">
        <span>
          <span style={{ display: 'block' }}>
            {freeCount > 0 ? interpolate(t('freeSlots'), { n: freeCount }) : t('freeSlotsNone')}
          </span>
          <span className="meta" style={{ letterSpacing: '0.02em', textTransform: 'none' }}>
            {t('dragHint')}
          </span>
        </span>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={madamMode}
            onChange={(event) => toggleMadam(event.target.checked)}
          />
          {t('madamMode')}
        </label>
      </div>

      {madamMode && (
        <MadamPanel
          weekStart={weekStart}
          weeks={bookableWeeks}
          pin={madamPin}
          onUnauthorized={handleUnauthorized}
          onSelectWeek={setWeekStart}
        />
      )}

      <BookingDialog
        open={selected !== null}
        block={selected}
        weekStart={weekStart}
        onClose={() => setSelected(null)}
      />

      <CancelDialog
        open={cancelSlot !== null}
        slot={cancelSlot}
        weekStart={weekStart}
        onClose={() => setCancelSlot(null)}
      />

      {gateOpen && (
        <MadamGate onClose={() => setGateOpen(false)} onSuccess={handleGateSuccess} />
      )}
    </div>
  )
}

export default SchedulePage
