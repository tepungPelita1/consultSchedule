# AGENTS.md

Single-page consultation scheduler (React 19 + Vite + TS + Tailwind v4, Supabase backend). No test framework and no GitHub Actions — Cloudflare Workers Builds runs `npm run build` on push, so a type error blocks the deploy. Docs are written in Malay (BM).

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (this is the only typecheck; `noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax` are on, so unused code breaks the build)
- `npm run lint` — oxlint (config in `.oxlintrc.json`)
- `npm run preview` — serve `dist/`
- Verify changes with `npm run lint && npm run build` (lint first; there are no tests)
- Path alias `@` → `src/` (defined in both `vite.config.ts` and `tsconfig.app.json`)

## Deployment

- Hosting is **Cloudflare Workers**, not Pages: `wrangler.jsonc` declares service `consultschedule`, static assets from `./dist` with SPA fallback, custom domain `consultation.ajamlab.my`, `workers_dev: false`. `wrangler` is not a dependency — the build runner installs it and runs `npx wrangler deploy`.
- Deploy is automatic via **Workers Builds** (GitHub App "Cloudflare Workers and Pages"). Every push to `staging` **and** `main` starts a build (`npm run build` = `tsc -b && vite build`) and adds a "Workers Builds: consultschedule" check to the commit; a red check means nothing shipped (the first nine commits all failed this way).
- **The Production branch in Workers Builds is `staging`** — verified by test on 17 Oct 2026: after pushing `staging` only, `origin/main` was still on the previous commit while `consultation.ajamlab.my` started serving the new build. So **pushing `staging` is the production release**, and `main` is only a mirror for reference. Builds from other branches become preview versions and leave the custom domain untouched.
- Workflow: do the work on `staging`, push it when the change is ready to go live, then fast-forward `main` so both branches match (`git checkout main && git merge staging && git push origin main && git checkout staging`). Never push half-finished work to `staging`. To make `main` the release branch instead, change it in the dashboard (Workers & Pages → `consultschedule` → Settings → Builds).
- `.env.production` (committed) supplies `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to the CI build; local dev reads `.env` (gitignored).
- Cloudflare never runs SQL — the deploy does not touch the database. Apply migrations in the Supabase SQL Editor.
- Run `supabase/migrations/0011_security_patch.sql` in Supabase SQL Editor after deploy changes. It must use `DROP FUNCTION IF EXISTS` before `CREATE FUNCTION` for `private.check_madam` and `public.madam_verify` (PostgreSQL cannot change function language via `CREATE OR REPLACE`).
- PIN Mod madam is `3915` (bcrypt hash in `private.app_config`). Rate limits: madam 3 wrong tries / 5 min, student wrong ID 3 tries / 10 min. Client logic lives in `src/lib/rateLimit.ts`; server tables are `private.pin_attempts` and `private.booking_attempts`.

## Supabase / data layer

- Dual-mode: with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (copy `.env.example` → `.env`) calls hit real Supabase RPCs; without them `src/lib/mock.ts` serves demo data with fake delays. `isSupabaseConfigured` in `src/lib/supabase.ts` is the gate — every hook in `src/lib/useSchedule.ts` branches on it. Add new data operations in BOTH branches.
- All DB access goes through RPCs, not raw table writes (`book_slot`, `set_booking_status`, `add/remove_allowlist`, `add/remove_extra_class_block`). RPCs raise error codes as exception messages: `NOT_ALLOWLISTED`, `INVALID_STUDENT_ID`, `WRONG_WEEK`, `INVALID_DAY`, `CLASS_TIME`, `SLOT_TAKEN`, `DAILY_LIMIT`, `OUT_OF_HOURS`, `INVALID_SLOT_LENGTH`, `RATE_LIMITED` (server lock), `MONDAY_ONLINE_ONLY`.
- SQL lives in `supabase/migrations/`: run `0001` → `0016` in order, then `supabase/seed.sql` (Supabase SQL Editor or `supabase db push`). Later migrations REDEFINE earlier functions — e.g. `0006` is the live `get_week_slots`, `0008` the live range-capable `get_week_slots`, `0010` the live `book_slot` (2-week prebooking window + race-safe daily limit), `0011` the security patch, `0012` removes student self-cancel, `0013` re-adds `student_name` (short code) to `get_week_slots`, `0014` enforces Monday online-only, `0015` is the live `book_slot` (weekend rollover window), `0016` re-adds `student_full_name` for approved blocks (hover full name); don't re-run older definitions expecting them to stick.
- Students **cannot** withdraw their own booking. `cancel_booking` / `cancel_booking_by_slot` RPCs are removed; only Madam can approve/reject via `set_booking_status`.
- Security patch (`0011_security_patch.sql`): removes open read policies on `allowlist`/`bookings`/`class_blocks`, exposes class/week/booking data only through RPCs. New RPCs: `get_supervisees`, `get_class_blocks`, `get_active_booking_weeks`, `get_week_bookings`. It also sets the Mod madam PIN to `3915` (hash bcrypt) and adds server-side rate limits: madam PIN 3 wrong tries / 5 min lock, student booking wrong ID 3 tries / 10 min lock (`private.pin_attempts`, `private.booking_attempts`, `private.client_bucket`). Client rate limits in `MadamGate`/`BookingDialog` match these values. To change the PIN: `update private.app_config set value = extensions.crypt('PIN_BAHARU', extensions.gen_salt('bf')) where key = 'madam_pin';`.
- `get_week_slots` currently returns `student_name` (short 3-letter code) so the pending block can show the student code, plus `student_full_name` (full name) but only for `approved` slots so the hover tooltip reveals who was approved. `mode` and `booking_id` stay hidden.
- Business rules enforced server-side: max 1 active booking/day/student (`bookings_active_unique` partial index), booking window = current week + 2 weeks ahead, 30-min slots exactly, 08:00–18:00, slots overlap-free against `class_blocks`, Monday (`day_of_week = 1`) is online-only (`MONDAY_ONLINE_ONLY`).
- Range booking: students drag a multi-slot range (`useBookRange`). `book_slot` (redefined in `0008_range_booking.sql`, window widened in `0009_prebooking_window.sql`, weekend rollover in `0015_weekend_rollover.sql`) accepts any positive multiple of 30 min and stores it as ONE booking row; `get_week_slots` marks every covered 30-min slot. Max 1 active booking/day/student still applies.

## Conventions

- `week_start` is always the Monday of a week, anchored to `Asia/Kuala_Lumpur` on both server and client (`getCurrentWeekStart()` in `src/lib/slots.ts`). Booking is open for the current week plus 2 weeks ahead — the UI clamps navigation to those 3 weeks (`getBookableWeeks()` / `getMaxBookableWeekStart()`). **Weekend rollover:** from Saturday 00:00 KL the *current* week becomes the next week (Sat/Sun add 7 days), so students land on the upcoming week while the finished week stays out of reach. Mirrored server-side in `0015_weekend_rollover.sql` — change both together. `day_of_week` is 1=Mon…5=Fri (`src/lib/types.ts`).
- i18n: inline `en`/`ms` dictionaries in `src/lib/i18n.ts` — every user-facing string needs both entries. App UI strings are BM/EN; code comments are often BM.
- Design tokens (colors, fonts, folder-card look) live in CSS custom properties in `src/index.css`; follow `DESIGN.md` and `PRD.md` for visual/business intent.
- Tailwind v4 is plugin-based (`@tailwindcss/vite`) — no `tailwind.config.js`; theme is configured in CSS.
