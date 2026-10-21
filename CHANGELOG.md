# Changelog

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
