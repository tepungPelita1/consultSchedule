# AGENTS.md

Single-page consultation scheduler (React 19 + Vite + TS + Tailwind v4, Supabase backend). No test framework, no CI. Docs are written in Malay (BM).

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (this is the only typecheck; `noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax` are on, so unused code breaks the build)
- `npm run lint` — oxlint (config in `.oxlintrc.json`)
- `npm run preview` — serve `dist/`
- Verify changes with `npm run lint && npm run build` (lint first; there are no tests)
- Path alias `@` → `src/` (defined in both `vite.config.ts` and `tsconfig.app.json`)

## Supabase / data layer

- Dual-mode: with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (copy `.env.example` → `.env`) calls hit real Supabase RPCs; without them `src/lib/mock.ts` serves demo data with fake delays. `isSupabaseConfigured` in `src/lib/supabase.ts` is the gate — every hook in `src/lib/useSchedule.ts` branches on it. Add new data operations in BOTH branches.
- All DB access goes through RPCs, not raw table writes (`book_slot`, `set_booking_status`, `add/remove_allowlist`, `add/remove_extra_class_block`). RPCs raise error codes as exception messages: `NOT_ALLOWLISTED`, `WRONG_WEEK`, `CLASS_TIME`, `SLOT_TAKEN`, `DAILY_LIMIT`, `OUT_OF_HOURS`, `INVALID_SLOT_LENGTH`.
- SQL lives in `supabase/migrations/`: run `0001` → `0009` in order, then `supabase/seed.sql` (Supabase SQL Editor or `supabase db push`). Later migrations REDEFINE earlier functions — e.g. `0006` is the live `get_week_slots`, `0008` the live range-capable `book_slot`/`get_week_slots`, `0009` the live `book_slot` with the 2-week prebooking window; don't re-run older definitions expecting them to stick.
- Business rules enforced server-side: max 1 active booking/day/student (`bookings_active_unique` partial index), booking window = current week + 2 weeks ahead, 30-min slots exactly, 08:00–18:00, slots overlap-free against `class_blocks`.
- Range booking: students drag a multi-slot range (`useBookRange`). `book_slot` (redefined in `0008_range_booking.sql`, window widened in `0009_prebooking_window.sql`) accepts any positive multiple of 30 min and stores it as ONE booking row; `get_week_slots` marks every covered 30-min slot. Max 1 active booking/day/student still applies.

## Conventions

- `week_start` is always the Monday of a week, anchored to `Asia/Kuala_Lumpur` on both server and client (`getCurrentWeekStart()` in `src/lib/slots.ts`). Booking is open for the current week plus 2 weeks ahead — the UI clamps navigation to those 3 weeks (`getBookableWeeks()` / `getMaxBookableWeekStart()`). `day_of_week` is 1=Mon…5=Fri (`src/lib/types.ts`).
- i18n: inline `en`/`ms` dictionaries in `src/lib/i18n.tsx` — every user-facing string needs both entries. App UI strings are BM/EN; code comments are often BM.
- Design tokens (colors, fonts, folder-card look) live in CSS custom properties in `src/index.css`; follow `DESIGN.md` and `PRD.md` for visual/business intent.
- Tailwind v4 is plugin-based (`@tailwindcss/vite`) — no `tailwind.config.js`; theme is configured in CSS.
