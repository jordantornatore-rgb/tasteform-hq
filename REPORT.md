# TasteForm HQ revamp — report (21 Oct 2026)

Live: https://jordantornatore-rgb.github.io/tasteform-hq/ · branch `main` (merged from `revamp`) · details in `AUDIT.md` and `CHANGELOG.md`.

## What was fixed and improved (top 10)

1. **One source of truth.** Every number is computed by `hq-core.js`, shared by the page, the tests and the hourly `hq-brief` edge function that writes the morning brief. The Slack report now sends that brief verbatim, so Slack and HQ cannot disagree.
2. **Today screen.** Goal strip ($10K by 31 Dec: recurring now, gap, days left, pace needed, bookings/week marked *estimate*), up to 7 ranked actions each saying why (calls tonight from Google Calendar, replies waiting, uncalled applicants, follow-ups, recipe follow-ups, content due vs this week's plan, never-messaged warm leads, win-backs; Stripe risks once connected), yesterday vs targets, 7/30-day funnel with "–" + reason, and a System health panel.
3. **Sydney time everywhere.** Day buckets used the browser's zone; now one Sydney-day rule, DST-aware, tested against the stored day keys.
4. **Unknown ≠ zero.** Days with no DM scan are hatched gaps, not 0 openers, and are excluded from totals and averages.
5. **Funnel tab (organic/paid)** with grouped stages so views never flatten applications, conversions only within a group, weekly scorecard vs `meta/contentPlan` (actual vs 4/3/2/1 with 8-week history), exact story→application matching, post table with saves/shares/follows, paid "paused, no data" state.
6. **Applications**: one-tap Answered / No answer / Voicemail / Booked / Showed / Signed that survive the hourly re-sync and feed the call stages until GHL exists.
7. **Performance**: render only the visible tab, only when a table changed (hash-compared polls). Was ~64 full re-renders a minute; now 0 when idle.
8. **Phone-first UI** on the brand (cream/espresso/oak, Anton + Open Sans, light and dark), bottom tab bar, 44 px targets, keyboard-navigable tabs, reduced-motion support, sticky coverage banner with plain-English reasons.
9. **Scheduled tasks**: DM scan and likes scan were silently suspended (`device_absent`) — re-enabled and both ran within minutes; content scan built and scheduled (4:32 daily, incremental, self-healing meta row); morning report rewired; Stripe sync and brief added as Supabase cron jobs; schedule has no collisions.
10. **Stripe groundwork**: admin-only tables enforced by RLS (proved: limited and anon see 0 rows), GET-only `stripe-sync`, "not connected" state with the exact key permissions.

Tests: 19 unit checks and 375 Playwright checks pass (every tab × 1280/390 × light/dark × admin/limited: zero console errors or warnings, no NaN/undefined, no horizontal scroll, touch targets, numbers equal independent recomputations, admin-only tabs hidden for non-admins).

## What I could not verify, and why

- **The real sign-in flow** (login persistence, storage-blocked warning): the auth code paths are unchanged apart from ignoring `TOKEN_REFRESHED`; tests use a mock client and never log in as Jordan. Worth a 10-second check on the phone: open the live URL, confirm you are still signed in.
- **The project docs** (`claude/tasteform-hq-architecture.md`, `hq-audit-2026-10-05.md`, the scan prompts): they live in the claude.ai Project, which this session cannot read. The scan routines still reference them by name, as before; the content scan I built is self-contained instead.
- **Stripe and GHL tabs with real data**: no keys yet. The not-connected states are tested; the connected rendering is tested only with the data shape the sync writes.
- **Scan model**: device-bound routines refuse a model change through the API (needs a signed edit), so the DM and likes scans still run on Opus. The morning report is on Sonnet now; the content scan runs as a local task.
- **Cron bearer token**: the pre-existing `typeform-sync-hourly` job embeds a bearer token in its SQL; decoding its role was blocked by the sandbox's safety filter. The two new jobs use the public anon key.

## Needs Jordan

1. **Stripe (read-only key into Vault, ~3 minutes)** — Stripe → Developers → API keys → *Create restricted key* named `tasteform-hq-readonly`; set **Read** on Customers, Subscriptions, Invoices, Charges, Balance, Products, Prices (everything else None). Then Supabase → project `hucqdrekawzsrbbkczgj` → Integrations → Vault → add secret `stripe_restricted_key`. The hourly sync picks it up; the Revenue tab fills and the goal strip switches to the Stripe figure.
2. **Current recurring $/month** — until Stripe is in, type it on the Today tab (admin only); the pace maths are blank without it.
3. **GoHighLevel** — create a read-only API token in GHL and add it to Vault as `ghl_readonly_token`; `ghl_secret()` is ready, the pull function is the next build. Until then answered/booked/showed/closed come from the one-tap outcomes.
4. **Content scan first run** — on the Mac mini, open the Claude app → Scheduled → "TasteForm HQ — Instagram content scan" → *Run now* once, approving the Chrome and Supabase tools, so unattended runs never pause. Keep the app open (same as for the other scans).
5. **Scan models** — if you want the DM/likes scans on Sonnet, change the model in each routine's settings on claude.ai (the API refuses it for device-bound routines).
6. **Meta Ads** — connect the official connector (steps on the Ads tab) when you want paid data.
7. **Typeform placements** — give each story/post its own link tag (`?utm_content=story-17oct`) so the story table can attribute applications exactly.
8. Optional clean-up only you can approve: six old one-shot routines and the `[OLD – no Supabase]` ones are disabled; the `ping_test*` SQL functions are leftovers. I did not delete anything.

## Scheduled tasks rebuilt or deleted

- Rebuilt: morning Slack report (new prompt, Sonnet) · content scan (new, local task) · DM scan and likes scan re-enabled unchanged.
- Added: `stripe-sync` (cron :35) · `hq-brief` (cron :40).
- Deleted: none. The disabled `[OLD – no Supabase]` routines and finished one-shots were left as they were (documented in AUDIT A).
