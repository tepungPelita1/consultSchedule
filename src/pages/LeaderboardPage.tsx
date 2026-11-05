import { format, parseISO } from 'date-fns'
import { enUS, ms as msLocale } from 'date-fns/locale'
import { useState } from 'react'
import { Cat } from '@/components/illustrations'
import type { TranslationKey } from '@/lib/i18n'
import { interpolate, useI18n } from '@/lib/i18n'
import {
  LEVEL_COLORS,
  buildStandings,
  compareRank,
  scoredWeeks,
  gapReason,
  paceFor,
  weekState,
} from '@/lib/leaderboard'
import type { Level, SeasonInfo, StudentStats, WeekState } from '@/lib/leaderboard'
import { useLeaderboard } from '@/lib/useSchedule'
import { useTheme } from '@/lib/useTheme'
import { cn } from '@/lib/utils'

const LEVEL_KEY: Record<Level, TranslationKey> = {
  gold: 'levelGold',
  silver: 'levelSilver',
  bronze: 'levelBronze',
}

const STATE_KEY: Record<WeekState, TranslationKey> = {
  attended: 'stateAttended',
  attended2: 'stateAttended2',
  missed: 'stateMissed',
  booked: 'stateBooked',
  current: 'stateCurrent',
  future: 'stateFuture',
}

const PODIUM_HEIGHTS = [132, 104, 80] // rank 1, 2, 3

function Crown({ level, size = 24, label }: { level: Level; size?: number; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 18"
      width={size}
      height={(size * 18) / 24}
      className="rk-crown"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M2 5l5 4 5-7 5 7 5-4-2 12H4z" fill={LEVEL_COLORS[level]} />
    </svg>
  )
}

function Avatar({ s, large = false }: { s: StudentStats; large?: boolean }) {
  return (
    <span className={cn('rk-av', large && 'lg')} aria-hidden="true">
      {s.name.charAt(0)}
    </span>
  )
}

/** Trek 12 minggu (komponen dikongsi). */
function Track({ s, season }: { s: StudentStats; season: SeasonInfo }) {
  const { t } = useI18n()
  return (
    <span className="rk-track">
      {Array.from({ length: season.length_weeks }, (_, i) => {
        const state = weekState(s, i, season)
        const label = interpolate(t('weekAria'), { n: i + 1, state: t(STATE_KEY[state]) })
        return <span key={i} className={cn('rk-w', state)} role="img" aria-label={label} title={label} />
      })}
    </span>
  )
}

function Dots({ s, season }: { s: StudentStats; season: SeasonInfo }) {
  return (
    <span className="rk-dots" aria-hidden="true">
      {Array.from({ length: season.length_weeks }, (_, i) => {
        const state = weekState(s, i, season)
        return <i key={i} className={cn((state === 'attended' || state === 'attended2') && 'on')} />
      })}
    </span>
  )
}

interface LeaderboardPageProps {
  onBack: () => void
}

function LeaderboardPage({ onBack }: LeaderboardPageProps) {
  const { t, lang } = useI18n()
  const { toggle } = useTheme()
  const query = useLeaderboard()
  const [open, setOpen] = useState<string | null>(null)

  const data = query.data
  const season = data?.season
  const standings = data ? buildStandings(data) : []
  // Minggu yang dah dikira — termasuk minggu semasa sebaik ada sesi yang habis.
  const done = data ? scoredWeeks(data) : 0
  const total = season?.length_weeks ?? 12

  const subtitle = interpolate(t('rankSeason'), { n: total })

  // Header sama dengan jadual: folder kuning + kucing (ketik = tukar tema).
  const header = (
    <header className="folder">
      <div className="fin" style={{ ['--c' as string]: 'var(--yellow)' }}>
        <span className="sq" />
        <button
          type="button"
          className="cat-btn"
          onClick={toggle}
          aria-label={t('toggleTheme')}
          title={t('toggleTheme')}
        >
          <Cat className="cat" />
        </button>
        <h1 className="title">{t('rankTitle')}</h1>
        <div className="hbot">
          <span className="meta">{subtitle}</span>
          <div className="nav">
            <button type="button" className="pill" onClick={onBack} aria-label={t('rankBack')}>
              ← {t('rankBackShort')}
            </button>
          </div>
        </div>
      </div>
    </header>
  )

  if (query.isLoading || !season) {
    return (
      <div className="rk-page">
        {header}
        {query.error ? (
          <div className="rk-state">
            <p className="meta">{t('errorMsg')}</p>
            <button type="button" className="pill" onClick={() => void query.refetch()}>
              {t('retry')}
            </button>
          </div>
        ) : (
          <div className="rk-skel" aria-busy="true" aria-label={t('loading')}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="rk-skel-row" />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (season.current_week < 1) {
    const locale = lang === 'ms' ? msLocale : enUS
    return (
      <div className="rk-page">
        {header}
        <div className="rk-state">
          <p>
            {interpolate(t('rankNotStarted'), {
              date: format(parseISO(season.start_date), 'd MMM yyyy', { locale }),
            })}
          </p>
        </div>
      </div>
    )
  }

  const seasonOver = season.current_week > season.length_weeks
  const left = season.length_weeks - season.current_week
  const bookedCount = standings.filter((s) => s.booked_this_week).length
  const podium = [2, 1, 0].map((i) => standings[i]).filter((s): s is StudentStats => Boolean(s))

  // Streak aktif terpanjang & purata kehadiran (untuk kad sorotan).
  const hot = [...standings].sort((a, b) => b.current - a.current || compareRank(a, b))[0]
  const avg =
    done > 0 && standings.length > 0
      ? Math.round(
          (standings.reduce((sum, s) => sum + s.attended, 0) / (standings.length * done)) * 100,
        )
      : null

  const weeksOf = (a: number) => interpolate(t('rankWeeksOf'), { a, b: done })

  const gapLine = (s: StudentStats, i: number) => {
    if (i === 0) return t('rankLeading')
    const above = standings[i - 1]
    const reason = gapReason(s, above)
    if (reason.kind === 'weeks') {
      return reason.n === 1
        ? interpolate(t('rankBehindOne'), { name: above.name })
        : interpolate(t('rankBehind'), { n: reason.n, name: above.name })
    }
    if (reason.kind === 'streak') return interpolate(t('rankLevelStreak'), { name: above.name })
    if (reason.kind === 'sessions') return interpolate(t('rankLevelSessions'), { name: above.name })
    if (reason.kind === 'first') return interpolate(t('rankLevelFirst'), { name: above.name })
    return interpolate(t('rankLevelName'), { name: above.name })
  }

  return (
    <div className="rk-page">
      {header}

      {/* Bar musim */}
      <div className="rk-season">
        <div className="rk-season-top">
          <b>
            {seasonOver
              ? t('rankSeasonOver')
              : interpolate(t('rankWeekOf'), { n: season.current_week, total })}
          </b>
          {!seasonOver && (
            <span className="rk-muted">
              {left === 1 ? t('rankWeekLeft') : interpolate(t('rankWeeksLeft'), { n: left })}
            </span>
          )}
        </div>
        <div className="rk-seg" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <i
              key={i}
              className={cn(
                i + 1 < season.current_week && 'd',
                i + 1 === season.current_week && 'c',
              )}
            />
          ))}
        </div>
      </div>

      <div className="rk-grid">
        <div className="rk-left">
          {/* Podium: 3, 2, 1 — bar diisi dengan minggu hadir & streak */}
          <section className="rk-stage" aria-label={t('rankPodium')}>
            <div className="rk-podium">
              {podium.map((s) => (
                <div key={s.key} className="rk-pc" style={{ ['--sc' as string]: s.color }}>
                  {s.rank === 1 ? (
                    <Crown level="gold" size={26} />
                  ) : (
                    <span className="rk-crown-gap" aria-hidden="true" />
                  )}
                  <Avatar s={s} large />
                  <b>{s.name}</b>
                  <Dots s={s} season={season} />
                  <span className="rk-bar" style={{ height: PODIUM_HEIGHTS[s.rank - 1] }}>
                    <span className="rk-bar-no">{s.rank}</span>
                    <span className="rk-bar-stat">
                      <strong>
                        {s.attended}/{done}
                      </strong>
                      <span>{t('rankWeeksShort')}</span>
                    </span>
                    {s.current >= 2 && <span className="rk-bar-fire">🔥 {s.current}</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Sorotan musim */}
          <section className="rk-high" aria-label={t('rankHighlights')}>
            <h2 className="meta">{t('rankHighlights')}</h2>
            <dl>
              <div>
                <dt>{t('rankHotStreak')}</dt>
                <dd>
                  {hot && hot.current > 0
                    ? interpolate(t('rankHotStreakValue'), { name: hot.name, n: hot.current })
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>{t('rankAvg')}</dt>
                <dd>{avg === null ? '—' : `${avg}%`}</dd>
              </div>
              {!seasonOver && (
                <div>
                  <dt>{t('rankThisWeek')}</dt>
                  <dd className="rk-tw">
                    <span className="rk-tw-dots">
                      {standings.map((s) => (
                        <i
                          key={s.key}
                          className={cn(s.booked_this_week && 'on')}
                          style={{ ['--sc' as string]: s.color }}
                          title={s.name}
                        />
                      ))}
                    </span>
                    {interpolate(t('rankBooked'), { n: bookedCount, total: standings.length })}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <div className="rk-right">
          {/* Senarai (fon: 4+, desktop: semua) */}
          <div className="rk-list">
            {standings.map((s, i) => {
              const isOpen = open === s.key
              const perfect = done > 0 && s.attended === done
              const tag = perfect
                ? `✨ ${t('rankPerfect')}`
                : s.current >= 2
                  ? `🔥 ${s.current}`
                  : ''
              const sub = s.attended === 0 ? t('rankNoConsult') : weeksOf(s.attended)
              const pace = paceFor(s.attended, done, total)
              return (
                <div
                  key={s.key}
                  className={cn('rk-it', i < 3 && 'top3')}
                  style={{ ['--sc' as string]: s.color }}
                >
                  <button
                    type="button"
                    className="rk-row"
                    aria-expanded={isOpen}
                    aria-controls={`rk-more-${s.key}`}
                    onClick={() => setOpen(isOpen ? null : s.key)}
                  >
                    <span className="rk-no">{String(s.rank).padStart(2, '0')}</span>
                    <span className="rk-mid">
                      <span className="rk-nm">
                        {s.name}
                        <small>
                          {sub}
                          {tag && ` · ${tag}`}
                        </small>
                      </span>
                      <Track s={s} season={season} />
                    </span>
                    <Crown level={s.level} size={24} label={t(LEVEL_KEY[s.level])} />
                  </button>
                  <div id={`rk-more-${s.key}`} className="rk-more" hidden={!isOpen}>
                    {s.attended === 0 ? (
                      <div>{t('rankEmpty')}</div>
                    ) : (
                      <>
                        <div>
                          {interpolate(t('rankAttendedLine'), {
                            a: s.attended,
                            b: done,
                            s: s.sessions,
                          })}
                        </div>
                        <div>{interpolate(t('rankStreakLine'), { n: s.best, c: s.current })}</div>
                        <div>{gapLine(s, i)}</div>
                        {pace !== null && (
                          <div>{interpolate(t('rankPace'), { a: pace, b: total })}</div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <footer className="rk-foot">
        <div className="rk-legend">
          <span>
            <i className="rk-w attended" style={{ ['--sc' as string]: '#8fb8de' }} />
            {t('legendAttended')}
          </span>
          <span>
            <i className="rk-w attended2" style={{ ['--sc' as string]: '#8fb8de' }} />
            {t('legendTwoSessions')}
          </span>
          <span>
            <i className="rk-w missed" />
            {t('legendMissed')}
          </span>
          <span>
            <i className="rk-w booked" />
            {t('legendBookedWeek')}
          </span>
          <span>
            <i className="rk-w future" />
            {t('legendToCome')}
          </span>
        </div>
        <p>{interpolate(t('rankRule'), { n: total })}</p>
        <p>{t('rankLevels')}</p>
      </footer>
    </div>
  )
}

export default LeaderboardPage
