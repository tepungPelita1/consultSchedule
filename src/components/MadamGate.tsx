import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'
import { interpolate, useI18n } from '@/lib/i18n'
import { formatCountdown, isLocked, recordFail, remainingMs, resetLimit, useLockCountdown } from '@/lib/rateLimit'
import { useMadamVerify } from '@/lib/useSchedule'

interface MadamGateProps {
  onClose: () => void
  onSuccess: (pin: string) => void
}

function MadamGate({ onClose, onSuccess }: MadamGateProps) {
  const { t } = useI18n()
  const verify = useMadamVerify()
  const [pin, setPin] = useState('')
  const { locked, text } = useLockCountdown('madam')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (locked || !pin) return
    try {
      const ok = await verify.mutateAsync(pin)
      if (ok) {
        resetLimit('madam')
        onSuccess(pin)
        onClose()
      } else {
        recordFail('madam', 3, 10 * 60 * 1000)
        if (isLocked('madam')) {
          toast.error(interpolate(t('rateLimitedMadam'), { time: formatCountdown(remainingMs('madam')) }))
        } else {
          toast.error(t('unauthorized'))
        }
      }
    } catch {
      toast.error(t('errorMsg'))
    }
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div
        className="folder mf"
        role="dialog"
        aria-modal="true"
        aria-labelledby="madam-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="fin" style={{ ['--c' as string]: 'var(--yellow)' }}>
          <span className="sq" />
          <form onSubmit={submit} style={{ marginTop: 14 }}>
            <h2 id="madam-title" style={{ margin: 0, fontWeight: 500, fontSize: 24 }}>
              {t('madamPinTitle')}
            </h2>
            <p style={{ margin: '6px 0 14px' }}>{t('madamPinBody')}</p>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span className="meta" style={{ display: 'block', marginBottom: 4 }}>
                {t('madamPinPlaceholder')}
              </span>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                disabled={locked}
                autoFocus
                maxLength={20}
              />
              {locked && (
                <span className="meta" style={{ display: 'block', marginTop: 6, color: '#E5533D' }}>
                  {interpolate(t('rateLimitedMadam'), { time: text })}
                </span>
              )}
            </label>

            <div className="acts">
              <button type="button" className="pill" onClick={onClose}>
                {t('cancel')}
              </button>
              <button type="submit" className="pill ok" disabled={verify.isPending || !pin || locked}>
                {verify.isPending ? t('loading') : t('madamSignIn')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default MadamGate
