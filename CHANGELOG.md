# Changelog

## 2.5.1 — 3 Nov 2026 (points only count once their day has passed)

- A point counts only when its date is today or earlier, and scanned points never before the challenge start (`counts()`); future bookings show as "booked ahead". 1:1s score the day after the call, not when booked. Manual log refuses future dates.

## 2.5.0 — 3 Nov 2026 (Challenge tab)

- New **Challenge** tab (Business group; phone → More), admin only. Four views:
  - **Leaderboard**: every client ranked by confirmed points for the month (sum of `challenge_events` with status `confirmed`), gap to 1st and to 5th, month picker (defaults to the current Sydney month). Tap a client for what they actually did (sessions done vs prescribed per week, check-ins on time, 1:1s, weight/food days of days scored, perfect weeks, chat messages/replies, photos, story tags, bio link, before/after, testimonial, referral calls/payments, prize post) and the points for each. "–" until the scan has scored a day; coverage gaps shown per client.
  - **Log by hand** (inside each client): 1:1, referral call (50), referral first payment (250, month of the date picked), testimonial (75, once a month), prize story post (50, credited to the following month). Each tap writes a `challenge_events` row (`source: manual`) and refreshes that client's `challenge_scores` row; Undo marks it `cancelled` (never deletes).
  - **Review**: `needs_review` events plus pending `challenge_reviews` rows. Approve writes the challengeConfig points (still inside the doc's weekly limits, otherwise `over_cap`, 0); Reject records the reason. Both set `reviewedBy: jordan` so the scan never rewrites them.
  - **Monday drafts**: the top-5 group post and two private messages per client (position line, then their top 3 focus areas by missed points), following the doc's rules. Each part of the wording rotates per client and per week; Copy stores a short hash on the member (`dmHistory`) so the next 4 weeks never repeat it. Blank with a reason until the scan has scored the Sunday.
  - **Scan health**: last challenge scan, 1FIT / Instagram / WhatsApp from `meta/challengeScan` (`sources` if present, otherwise derived from `coverage.failed`); amber after 26 h, red when the last run failed.
- Points always come from `meta/challengeConfig`; nothing hard-coded. No steps anywhere (the doc says steps never score).
- Scan health: overall red when every source failed even if the scan wrote no `status`; amber when some did; shows `notIn1Fit`, `notInWhatsApp`, the scan note and items carried to the next run.
- `challenge_scores` (id `<member>|<month>`) is kept equal to the confirmed events whenever the tab is open.
- RLS: `challenge_clients`, `challenge_events`, `challenge_scores`, `challenge_reviews`, `challenge_members` and the `meta` rows `challengeConfig`/`challengeScan` are admin-only (`is_admin()`), see `supabase/migrations/20261103_challenge_tables_admin_only.sql`.
- Tests: `tests/challenge.test.js` (seeded mock data, 99 checks); `tests/mock-supabase.js` understands `eq('data->>field', v)`.

## 2.4.0 — 3 Nov 2026 (Content Library + autopost pipeline hooks)

- Content Engine: new default **Library** view (pipeline strip with live counts, Needs you, Waiting for you with inline previews + Approve / Approve all / Request changes, Mon–Sun calendar with drag-to-move, Move to… and 15-minute time dropdowns through `content-reschedule`, Up next, Posted with 24 h / 7 d metrics, filters + search, rules the editor has learned). Auto post switch (`meta/posting.autoPost`).
- Post sheet: video preview, timeline, schedule controls, feedback thread, every section editable through `content-update` (caption count / 2,200, hooks reorder, sound from `content_sounds`, platforms before scheduling), Pull from schedule, Mark fixed, Re-edit video.
- Statuses extended to `to_film, filmed, editing, edited, awaiting_approval, approved, scheduled, posted` + side states `changes_requested, needs_jordan, error, skipped, cancelled`.
- `supabase/functions/content-pipeline`: data door for the Mac Mini pipeline (deploy pending).

## 2.3.0 — 3 Nov 2026 (Content Engine tab)

- New **Content Engine** tab (Growth group; phone → More) with four views: **This week** (Mon–Sun board of `content_queue`, progress out of 18, filming list by location, script sheet with copy buttons and a status stepper that merges only `status` + `statusAt`), **Idea Bank** (`content_ideas` newest first, filters, Skip / Use next week), **Performance** (`meta/contentReview`: top/bottom 3, format leaderboard, hook style, angle, test-month countdown, "Approve these 5" → `meta/contentScan.coreFormats`) and **Scanner** (watchlist + last run). Admin-only writes, Sydney dates, `–` with a reason for anything missing. See `CONTENT_ENGINE.md`.
- `tests/ui.test.js` covers the new tab and the three content tables.

## 2.2.0 — 26 Oct 2026 (scans that cannot quietly stop early)

- Scan prompts v6 (`scans/`): run-discipline block (START/DEADLINE, SQL queues, batch loop, finish gate), self-reported `stoppedEarly` / `minutesUsed` / `queueRemaining` / `stepsDone`; DM backlog split into its own nightly routine (22:40, 50 min) with URL-based re-verification; likes scan resumes big posts in pages; content scan merge-only.
- `hq-core.js` 2.2.0: health panel shows "Stopped early" (red) from the scans' own report and a new "DM backlog (nightly deep pass)" row.
- Mac-mini Claude-app backup tasks removed (they only ever showed as failed).

## 2.1.0 — 21 Oct 2026 (command-centre layout)

- Replaced the row of 10 tabs with a left **sidebar** grouped Command / Pipeline / Growth / Business (icons, badges, number shortcuts 1–9/0, collapsible to an icon rail, remembered per viewer). Phones keep the bottom bar.
- Sticky **status bar**: section title, Sydney date/time, DM-scan freshness chip, theme toggle.
- Sidebar footer: scan health dots (DM / likes / content / Typeform / report), live-sync indicator, account.
- **Command palette** (⌘K, Ctrl+K or `/`): jump to any section, switch theme, open the Instagram inbox or the Typeform form, sign out.
- Dark is now the default (black→espresso gradient with a faint grid); light stays one tap away.
- Supabase: `hq_merge(table, rows)` — one merge-only write path for the scans so unattended runs never hit a "destructive statement" approval prompt (the cause of the 3-minute timeouts in the old runs).
- Scans: v5 prompts for the DM scan, likes scan and the new content scan (`scans/*.md`) run as claude.ai routines bound to the Mac mini, on Sonnet; the Claude-app tasks on the Mac mini hold backup copies, disabled.

## 2.0.0 — 21 Oct 2026 (revamp branch)

### Added
- `hq-core.js`: the one shared implementation of every number on the page (Sydney calendar, DM funnel rules, follow-up cadence, dm_daily series, Instagram posting-time decoding, weekly scorecard, Typeform windows, goal maths, system health, the Today brief and its Slack text). Loaded by `index.html`, the tests and the `hq-brief` edge function.
- **Today** tab (replaces Dashboard): $10K goal strip (admin-editable current recurring, client value, show/close rates marked as estimates), ranked "Do this today" list built only from real rows, yesterday vs targets, 7/30-day funnel snapshot with "–" + reason, System health panel (one row per job, red/amber/green/grey).
- **Funnel** tab: Organic / Paid toggle (remembered per viewer), grouped organic funnel (Content → Capture → DM → Application → Call) with conversion only inside a group, weekly scorecard vs `meta/contentPlan` with 8-week history, posts & reels table (saves/shares/follows/stage/CTA/keyword), story CTA table with exact tag attribution, source table. The old Content tab lives here; every number it showed is still reachable.
- **Revenue** tab (admin only): Stripe MRR vs goal, active/new/churned, payments at risk, renewals, revenue by month, client lifetimes; "not connected" state with the exact read-only key steps. Rows are admin-only in the database (RLS), not just hidden.
- Applications: one-tap outcomes (Answered / No answer / Voicemail / Booked / Showed / Signed / Not a fit) that survive the hourly Typeform re-sync; funnel shows Answered / Booked / Showed / Signed from those outcomes, labelled "marked by hand".
- Phone layout: bottom tab bar (Today, Funnel, DMs, Follow-ups, Apps, More), 44 px targets, sticky coverage banner; keyboard arrow navigation on desktop tabs; light/dark toggle; `prefers-reduced-motion` respected.
- Supabase: `stripe_summary`, `stripe_subscriptions`, `stripe_daily` (admin-only select), `stripe_secret()` / `ghl_secret()` (service-role only), `meta/goal`, `meta/ghlSync`, `meta/stripeSync`; edge functions `stripe-sync` (GET-only, hourly at :35) and `hq-brief` (hourly at :40, writes `meta/todayBrief`).
- Tests: `tests/core.test.js` (unit), `tests/ui.test.js` (Playwright, mock Supabase, 1280/390 × light/dark × admin/limited), `tests/mock-supabase.js`.

### Changed
- All day bucketing uses Sydney days (was the browser's zone).
- Days with no DM scan are drawn as "no scan" gaps and excluded from totals (were drawn as 0).
- Renders happen only for the visible tab and only when a table's data changed (was every tab on every 15 s poll).
- Supabase `TOKEN_REFRESHED` no longer re-runs the sign-in flow.
- Trend chart uses brand colours with dash patterns and markers (colour is never the only cue).
- Hard-coded schedule text replaced by `meta` values and a per-task staleness window.
- `<title>`/charset fixed; safe-area padding moved to `body`.

### Removed
- Nothing. The Dashboard became Today; Content became part of Funnel. `index.backup.html` is the pre-revamp file (ignored by git).
