# TasteForm HQ tests

- `node tests/core.test.js [fixtureDir]` — unit tests for `hq-core.js` (Sydney dates, funnel rules, follow-ups, scorecard, goal maths, Today).
- `node tests/ui.test.js [fixtureDir] [--shots dir]` — Playwright: serves the repo, injects a mock Supabase client (`tests/mock-supabase.js`) seeded from the fixtures, drives every tab at 1280 px and 390 px, light and dark, admin and limited. Asserts zero console errors/warnings, no `NaN`/`undefined`, no horizontal scroll, 44 px touch targets, and key numbers against independent computations.

Fixtures are anonymised exports of the Supabase tables (`select jsonb_agg(...)` per table, run through a scrubber that hashes names/handles and drops message text, emails and phones). They are **not committed** because they still describe real conversations; regenerate them with a read-only `select` and the scrubber, then pass the folder as the first argument.

Content Engine v2 rows are synthetic and committed inside `ui.test.js` (`contentFixtures`), so those checks run with any fixture folder. `HQ_ONLY_CONTENT=1` skips the big per-tab loop.

Env: `PLAYWRIGHT_PATH` (path to a playwright install), `HQ_CHROME` (Chromium executable; otherwise Playwright's bundled browser), `HQ_NOW` (fixed "now", ISO; default 2026-10-21T04:00:00Z).

- `node tests/analytics.test.js [--shots dir]` — Analytics tab on committed synthetic data (no fixtures needed).
- `node tests/subs.test.js [--shots dir]` — Subscriptions tab on committed synthetic data (no fixtures needed): totals per currency, renewals rolling forward, add/edit/cancel/delete writes, admin only.
