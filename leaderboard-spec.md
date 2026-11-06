# Feature spec: Consultation Leaderboard ("Show rank")

Audience: the coding agent working on consultSchedule.
Status: design agreed with the owner, ready to implement. Visual reference prototype: https://claude.ai/artifact/Cn8ebLz2iMUEHVn6YVfdV3 (HTML mock with fake data; use it for look and layout only, not as production code).

## 1. Goal

Add a light gamification layer so the 7 students of Madam Idayati are motivated to consult regularly. Students normally consult **once a week**, so the system rewards **showing up every week**, not booking a lot.

Constraints that already exist in the project and must be respected:

- React 19 + Vite + TypeScript + Tailwind v4, Supabase (PostgreSQL + RPC), Cloudflare Workers.
- All data goes through **RPC, never direct table access**. Keep client + server rate limiting.
- Dual mode: real Supabase, or mock demo when env vars are missing. The leaderboard must work in both.
- i18n BM/EN, dark mode, mobile first (laptop is secondary).
- Weekend rollover: Saturday 00:00 Kuala Lumpur time, the current week becomes the next week.

## 2. Navigation

- Add a **"🏆 Show rank"** button to the footer row of the schedule page, between "N free slots this week" and the "Madam mode" checkbox. Pill style, 1.5px border in the accent yellow, transparent background.
- The button carries a teaser on the right in muted text, e.g. `Nurul leads · 5/5` (current leader and their weeks attended / completed weeks).
- Pressing it opens the **Leaderboard page**. The page header has a round back button (←) that returns to the schedule.
- Routing: use a plain hash, `#rank` and `#schedule` (no query string, no path in the hash). Show the view that matches `location.hash` on load and on `hashchange`.
- Madam mode does not change the navigation. Madam sees the same page, with the "You" card hidden (she is not a student).

## 3. Ranking rules (source of truth)

> Updated 6 Nov 2026 to match what actually shipped (`0019_leaderboard.sql`,
> `0020_live_scoring.sql`, `src/lib/leaderboard.ts`). The original draft
> assumed Madam would mark attendance and that a week only counted once the
> whole week had ended. Neither is true: attendance marking was never built,
> and scoring is now live.

**Season:** start and length live in `private.app_config` as `season_start`
and `season_weeks` (currently `2026-09-28` and `12`), never hard-coded. Mock
mode uses `SEMESTER_WEEK1_START` + 12.

**A week counts for a student when** they have at least one `approved` booking
in that week **whose session has already finished** — `slot_end` has passed in
`Asia/Kuala_Lumpur`, checked against `private.kl_now()`. There is **no
attendance marking**; Madam only approves or rejects. Pending and rejected
bookings never count. Several sessions in the same week still count as **one**
week (the extra sessions only feed the tiebreakers and the "2 sessions" marker).

Because the count is computed live at query time, a **late approval fills its
week in retroactively** — nothing is snapshotted, so there is no deadline by
which Madam must approve for a week to count.

**`weeks[i]` is `null` when the week is undecided:** a future week, or the
current week with no finished session yet. `null` is not zero — this is what
stops a student with a Wednesday slot from being shown as `missed` on Monday.
`computeStats` stops at the first `null`.

**Primary score:** weeks attended out of `scoredWeeks()` — completed weeks
**plus the current week once any student has a finished session in it**.
Displayed as `4 of 5 weeks`. Use `scoredWeeks()`, not `completedWeeks()`, as
the denominator for levels and averages, or `attended` can exceed the number
of weeks counted. There are no points.

**Ranking order (all descending):**
1. weeks attended
2. longest streak of consecutive attended weeks
3. total attended sessions
4. **earliest counted consultation slot** (`first_slot_at`) — whoever consulted
   first stays above. A Monday 10:00 slot beats a Wednesday 14:00 slot in the
   same week. Students with no counted session sort last.
5. alphabetical by name, only as a final determinism fallback (stable, no
   shared ranks shown)

**Week states** (per student, per week):
- `attended` (1 session), `attended2` (2+ sessions): a week with finished
  approved sessions — **including the current week**, as soon as a session ends
- `missed`: a past week with no finished approved session
- `booked`: the current week, a pending or approved booking exists but no
  session has finished yet
- `current`: the current week, nothing booked
- `future`: weeks after the current one

The **Saturday 00:00 KL rollover** moves the current week forward (Sat/Sun add
7 days), mirrored server-side in `0015_weekend_rollover.sql` and client-side in
`getCurrentWeekStart()`.

**Derived values:**
- `currentStreak`: consecutive attended weeks ending at the last decided week.
- `pace = round(weeksAttended / scoredWeeks * seasonWeeks)`. Hide when `scoredWeeks = 0`.
- **Level** by rate `weeksAttended / scoredWeeks`: Gold >= 80%, Silver >= 50%,
  Bronze below. With `scoredWeeks = 0`, show Bronze.
- "Perfect" tag when `weeksAttended === scoredWeeks && scoredWeeks > 0`.
- Fire tag with the streak number when `currentStreak >= 2`.
- Gap line for rank > 1: `N weeks behind <name above>`; when weeks are equal,
  name the tiebreaker that actually decided it — longest streak, total
  sessions, `Level with <name> on everything, but <name> consulted earlier`,
  or the name fallback.

Reference implementation (see `src/lib/leaderboard.ts` for the live code):

```ts
type WeekCount = number | null; // sessions finished that week; null = undecided

export const compareFirstSlot = (a, b) => {
  if (a.first_slot_at === b.first_slot_at) return 0;
  if (!a.first_slot_at) return 1;
  if (!b.first_slot_at) return -1;
  return a.first_slot_at < b.first_slot_at ? -1 : 1;
};

export const compareRank = (a, b) =>
  b.attended - a.attended || b.best - a.best || b.sessions - a.sessions ||
  compareFirstSlot(a, b) || a.name.localeCompare(b.name);
```

## 4. Backend (Supabase RPC only)

> Updated 6 Nov 2026. The original draft called for an `attended` column and a
> `mark_attended` RPC. **Neither was built, and neither is needed** — a session
> is credited once its `slot_end` has passed, so there is nothing for Madam to
> tick. The draft also had `get_leaderboard()` returning `student_id`; the
> shipped RPC deliberately does not.

1. **No schema change to `bookings`.** No `attended`, no `attended_marked_at`,
   no `mark_attended` RPC, and no "Mark present" toggle in Mod madam. Madam's
   only actions stay approve and reject (`set_booking_status`).
2. Helper `private.kl_now()` (`0020_live_scoring.sql`) returns the current
   `Asia/Kuala_Lumpur` wall-clock time. A booking is credited when
   `(week_start + (day_of_week - 1)) + slot_end <= private.kl_now()`.
3. RPC `public.get_leaderboard()` — **no arguments**, returns one JSON object:
   - `season`: `start_date`, `length_weeks`, `current_week`.
   - `students[]`: `key` (the random `allowlist.id` uuid), `full_name`,
     `short_name`, `weeks` (length = season weeks; count of credited sessions,
     `null` where undecided), `first_slot_at` (earliest credited slot, for the
     tiebreaker), `booked_this_week`.
   - **Never returns `student_id`**, booking ids, modes or slot times. The page
     is a public read-only view, so it must not become a way to enumerate
     student IDs.
   - Counts only `approved` bookings whose session has finished. Week indexes
     are computed in SQL from `season_start`, and the current week comes from
     `private.current_week_monday()`, which applies the same Saturday 00:00 KL
     rollover as the client — so the two cannot disagree.
   - Season config read from `private.app_config` (`season_start`,
     `season_weeks`), clamped to 1..52.
4. `security definer`, `stable`, `revoke all from public` then
   `grant execute to anon, authenticated` — the same pattern as the other
   read RPCs. No direct table access from the client.
5. Student colour: assigned client-side in `buildStandings()` from the palette
   in section 7, indexed by `short_name` order so it is stable and unique. No
   `color` column.
6. Mock mode: `mockGetLeaderboard()` in `src/lib/mock.ts` mirrors the same
   rules, including the finished-session check and `first_slot_at`, so the page
   works without env vars and the ordering matches real mode.

## 5. Layout: phone (default)

Single column, page scrolls only if the viewport is short. Top to bottom:

1. **Header** in the app's yellow notch card, compact: round back button, title "Leaderboard", subtitle "12-week consultation season", small cat on the right.
2. **Season bar**: `Week 6 of 12` on the left, `6 weeks left` on the right, below it 12 thin segments: completed filled accent, current weeks outlined accent, rest muted.
3. **Podium** for ranks 1–3, ordered **3, 2, 1 left to right** (matches the reference). Each column: avatar (initial in the student's colour, ring in the same colour), name, `N of M weeks`, a row of 12 tiny dots (filled when attended), then a rounded bar in the student's colour with the rank number. Bar heights 62 / 84 / 110 px for ranks 3 / 2 / 1. A gold crown sits above the rank 1 avatar.
4. **"You" card** (students only): accent yellow card with the student's avatar and name, then three stats: `Weeks 4/5`, `Level Silver` with a crown icon, `Rank #3`. Text is dark (`#1c1915`) on yellow.
5. **This week** row: label, 7 small circles (filled in the student's colour once booked), and `3/7 booked` on the right.
6. **List for ranks 4–7**: each row has a two-digit rank (`04`), name with a muted line `4 of 5 weeks · 🔥 3`, the **12-week track** beneath, and a level crown on the right. The current student's row has an accent border.
7. **Row detail**: tapping a row expands it (accordion, one open at a time, `aria-expanded`). Shows: attended weeks and sessions, longest and current streak, the gap line, pace. Zero attendance shows: "Book a slot this week to get on the board."
8. **Footer**: legend, the ranking rule sentence, level thresholds.

**12-week track** (shared component, 12 flex pills, 11px high, 3px gap, 3px radius):
- attended: filled with the student's colour
- 2+ sessions: same fill plus a 1.5px inset outline in the text colour
- missed: muted surface colour
- booked (current week): orange `#f0b36e` fill with a 1.5px accent outline
- current, not booked: transparent with 1.5px accent outline
- future: transparent with 1px dashed border

## 6. Layout: desktop (≥ 900px)

Two columns, `1fr 1.2fr`, 24px gap, content max width 1000px centred.
- Left: podium and "You" card.
- Right: the "This week" row and the **full list ranks 1–7** (ranks 1–3 are hidden on phone and shown here), with tracks and accordion details.
- Footer spans the full width.

## 7. Visual tokens (match the existing app)

| Token | Dark | Light |
|---|---|---|
| bg | `#1f1b16` | `#f5f0e4` |
| surface | `#27231d` | `#fffaf0` |
| line | `#3d372f` | `#ddd3bd` |
| ink | `#f3ece0` | `#231f1a` |
| muted | `#a69d8e` | `#6f6757` |
| off (empty pill) | `#342f28` | `#e8e0cc` |
| accent / hero | `#e8c95a` | `#e8c95a` |

- Follow the system theme and the app's existing dark-mode toggle. Hero text is always `#1c1915`.
- Student pastel palette (assign by stable hash): `#9fd9a8`, `#8fb8de`, `#e6d98a`, `#c9a6e4`, `#8fd6cc`, `#e8a0a0`, `#f0b36e`. Text on these is dark.
- Level crowns: Gold `#f2b134`, Silver `#c9cfd6`, Bronze `#d98f52`. Crown is a small 24×18 SVG (`M2 5l5 4 5-7 5 7 5-4-2 12H4z`).
- Use the app's existing font. The prototype used Bricolage Grotesque only as a stand-in.
- Hero uses the same notch clip-path as the schedule page header.

## 8. i18n keys

| key | EN | BM |
|---|---|---|
| rank.button | Show rank | Lihat ranking |
| rank.title | Leaderboard | Papan markah |
| rank.season | 12-week consultation season | Musim konsultasi 12 minggu |
| rank.weekOf | Week {n} of 12 | Minggu {n} daripada 12 |
| rank.weeksLeft | {n} weeks left | {n} minggu lagi |
| rank.weeksOf | {a} of {b} weeks | {a} daripada {b} minggu |
| rank.you.weeks | Weeks | Minggu |
| rank.you.level | Level | Tahap |
| rank.you.rank | Rank | Kedudukan |
| rank.thisWeek | This week | Minggu ini |
| rank.booked | {n}/7 booked | {n}/7 dah tempah |
| rank.perfect | perfect | sempurna |
| rank.behind | {n} week(s) behind {name} | {n} minggu di belakang {name} |
| rank.leading | Leading the season | Mendahului musim |
| rank.pace | Pace: about {a} of 12 weeks | Jangkaan: kira-kira {a} daripada 12 minggu |
| rank.empty | Book a slot this week to get on the board. | Tempah satu slot minggu ini untuk masuk papan markah. |
| rankRule | Ranked by weeks with an approved consultation, out of {n}. A week counts once, however many consults you book in it, and it counts as soon as the session is over. Ties go to the longest streak, then total sessions, then whoever consulted earlier. | Kedudukan ikut bilangan minggu yang ada konsultasi diluluskan, daripada {n}. Satu minggu dikira sekali sahaja, tak kira berapa konsultasi dibuat, dan ia dikira sebaik sesi itu habis. Jika seri, ikut streak terpanjang, kemudian jumlah sesi, kemudian siapa konsultasi lebih awal. |
| rankLevelFirst | Level with {name} on everything, but {name} consulted earlier | Seri penuh dengan {name}, tapi {name} konsultasi lebih awal |
| rank.level.gold/silver/bronze | Gold / Silver / Bronze | Emas / Perak / Gangsa |

Drop the "Preview as" dropdown from the prototype. It exists only for the mock. The real "You" card follows the signed-in student.

## 9. Accessibility and quality

- Every pill, dot and crown has a text alternative or sits next to text that says the same (`aria-label="Week 3: attended"`). Colour is never the only signal; the 2-session outline and the dashed future style carry meaning too.
- Rows are real `<button>` elements with visible keyboard focus (2px accent outline).
- Contrast: dark text on every pastel and on the yellow card.
- Respect `prefers-reduced-motion`. Avoid animation except the accordion expand.
- Safe-area padding for phones (`env(safe-area-inset-*)`), viewport `viewport-fit=cover`.
- Loading state: skeleton rows of the same height. Error state: short message with a retry button. No-data state (season not started): "The season starts on {date}."

## 10. Acceptance checklist

- [ ] Show rank button appears on the schedule footer and opens the leaderboard; back returns to the schedule; `#rank` deep link works and survives refresh.
- [ ] Only `approved` bookings whose session has already finished count; a week with 3 sessions counts as one week.
- [ ] The current week turns green as soon as a session ends, and shows `booked`/`current` (never `missed`) while it is still undecided.
- [ ] Two students level on weeks, streak and sessions are ordered by the earlier consultation slot, not by name.
- [ ] Ranking order follows section 3 and is identical in mock and real mode.
- [ ] After Saturday 00:00 KL the previous week turns completed and the denominator increases by one.
- [ ] Podium order is 3, 2, 1 on phone; desktop shows the two-column layout with all seven rows.
- [ ] "You" card matches the signed-in student, hidden for Madam.
- [ ] Student with 0 attended weeks shows the empty-state line and a Bronze crown.
- [ ] Madam can mark a past approved booking as present, and the leaderboard updates on next load.
- [ ] No direct table reads; both RPCs are rate limited and return no private booking data.
- [ ] EN/BM strings present, dark and light themes checked on a 360px wide viewport.

## 11. Open questions for the owner

1. Fixed season (final rank locks at week 12) or rolling last-12-weeks window? This spec assumes a fixed season.
2. Should Madam be able to hide names or use nicknames on the leaderboard (privacy)?
3. Does the season start on 28 Sep 2026 (Week 1)? Confirm the exact start date and whether any break weeks should be skipped.
