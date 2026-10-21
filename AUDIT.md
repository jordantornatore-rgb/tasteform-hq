# TasteForm HQ — audit log (revamp branch)

Started 21 Oct 2026 (Sydney). Ground truth: `index.backup.html` = the file that was live on
GitHub Pages at the start (md5 `f255c4d19a284aa496f292e987093a37`, 235,904 bytes, 3,514 lines).
Everything below was found by reading the whole file, spot-checking formulas against the Supabase
rows with read-only SQL, and reading the claude.ai routine definitions and their run logs.

Columns in the fix tables: **Issue** (what was wrong) · **Fix** (what changed) · **Verified by**
(how I checked — SQL, Playwright test name, or manual).

---

## A. Scheduled tasks — inventory (Phase D, step 1)

Source: claude.ai routines (`RemoteTrigger list`), Supabase `cron.job`, `meta` rows.

| Task | Where it runs | Schedule (Sydney) | Last success | State on 21 Oct | Verdict |
| --- | --- | --- | --- | --- | --- |
| DM scan v4 (`trig_01Vt9c4zrEc2sQaak2wuARtR`) | Claude routine, Chrome on "2nd's Mac mini" | 6:07, 10:07, 14:07, 18:07, 22:07 | 20 Oct 14:26 (coverage **incomplete**: ~90 leads not re-verified, 280 `pending-` rows left) | **enabled: false, suspension `device_absent`** — the Mac mini's Claude app/Chrome was not reachable, so the 22:07, 6:07 and 10:07 runs never fired | **dead** (device) |
| Likes scan v4 (`trig_01KeUsHa77KBVdTFEtH4YfUe`) | Claude routine, Chrome on Mac mini | 3:15 daily | 20 Oct 03:25 (5 posts, 238 likers, ok) | **enabled: false, `device_absent`** | **dead** (device) |
| Morning Slack report (`trig_011jUZRxQaMMSTn9T93xzHMZ`) | Claude routine, cloud (Opus) | 6:47 daily | 21 Oct 06:54 (posted to Jordan's DM) | enabled | healthy, but it re-implements the dashboard maths in a Python script inside the prompt (drifts from HQ: it had no magnet/outbound split for "waiting", no Typeform, no content) |
| Routine ← Google Calendar sync (`trig_01Ya4DQYU7JrFUeRxvRHR5m1`) | Claude routine, cloud (Sonnet) | 6:12, 9:12, 12:12, 15:12, 18:12 | 21 Oct 12:13 | enabled | healthy |
| Typeform sync (`cron.job` 1 → edge fn `typeform-sync`) | Supabase pg_cron + edge function | :23 every hour | 21 Oct 14:23 (ok) | active | healthy |
| Ads sync v2 | — | — | never (`meta/adsSync` absent, `ads_daily` empty) | no routine exists | **not built** (Meta connector not connected) |
| Content scan v2 (`ig_posts`/`ig_stories`) | — | — | never as a task; `meta/igScan` says "seeded manually, backfill not run" | no routine exists | **not built** |
| `[OLD – no Supabase]` DM scan / likes scan / morning report | Claude routines | — | 18–19 Oct | disabled | superseded (left disabled, documented) |
| Catch-up / check-in one-shots (×6) | Claude routines | run-once | Sep–Oct | ended | noise, leave |
| DM Reply Rate Sync (`trig_01ENKq5R6zhHDeiHMgUT4LGh`) | Claude routine | 21:00 UTC | 4 Oct | disabled | superseded by HQ |

Collision check (Sydney): likes 3:15 → DM 6:07 → calendar 6:12 → Typeform 6:23 → report 6:47. No
overlap today; the content scan is placed at 4:30 (after likes, well before the report).

Why the two Instagram scans stopped: both routines are bound to the Mac mini device and were
suspended by the platform with `device_absent` (the app/Chrome was off or asleep when the cron
fired). They are not broken — they cannot run without the Mac. Fix is in section D.

## B. Data facts that shape the fixes

- `dm_threads` 530 rows: 496 leads, 23 personal, 8 other. 314 leads are `pending-*` placeholders
  with no `threadId` (the scan wrote `funnel` for them — 175 magnet, 139 outbound — but no
  direction/opener, so the app correctly keeps them out of both funnels). Verified threads:
  53 outbound/outbound, 45 outbound with no `funnel` field, 18+10 magnet (`opener=magnet_delivery`
  — 10 of them `direction=outbound`), 11 "inbound", 5 funnel=outbound but direction=inbound.
  The dashboard derives the funnel from `opener` (magnet) + `direction` (outbound) and ignores the
  scan's `funnel` field; that matches the 5 Oct rules and I kept it.
- `dm_daily` exists only for days a scan ran (25 docs since 14 Sep). A missing day is **unknown**,
  not zero — the old chart drew it as 0.
- `tf_daily`: `started` always equals `completed` (plan has no partial responses) — confirmed on
  every row sampled. The Typeform sync works and writes Sydney days.
- `ig_posts` ids are Instagram media ids. `(id >> 23) + 1314220021721` ms gives the exact posting
  time — checked against the scan's own labels ("1 Oct" → 1 Oct 19:23, "13 Oct" → 13 Oct 18:45) and
  against the `posts` table shortcodes (DeOgi86BpE4 → 8 Oct 19:30, matches its label). So every
  post and story can be placed on an exact Sydney day without guessing.
- `contacts`: 9 super_engaged, 63 close_friends, 74 personal, 8 **inactive** (a tier the old page
  never showed anywhere).
- RLS: every data table lets any signed-in user select/insert/update; delete is `is_admin()`.
  `tf_secret()` (Vault read) is executable only by `service_role` ✔. Vault holds `typeform_token` only.
- 1 admin profile, 1 limited profile, 1 open invite (limited).

## C. Findings — correctness

| # | Issue | Fix | Verified by |
| --- | --- | --- | --- |
| C1 | Day buckets used the **browser's** time zone (`dayKey(new Date())` in Messages/day, Outreach pace, Applications windows, Content day table, Follow-up "today"), while every stored day key (`dm_daily`, `tf_daily`) is a **Sydney** day. Correct in Sydney, wrong anywhere else (and wrong for the setter/VA if abroad). | One rule: all day keys and "today" come from `HQ.sydDay()` / `HQ.sydNow()` (Intl, `Australia/Sydney`, DST-aware) in `hq-core.js`. | `tests/core.test.js` "sydney day keys"; Playwright run with `TZ=UTC` shows the same numbers as `TZ=Australia/Sydney` |
| C2 | Days with no `dm_daily` doc were drawn as **0 openers** in Messages/day and Trends. The scan did not run 6–11 Oct, so those were unknown, not zero. | Missing day = "no scan" (hatched gap, excluded from totals and averages, shown as "–" in tables). | fixture day 2026-10-09 renders "–" |
| C3 | 5 Oct fixes re-checked and still hold: openers = `direction==='outbound' && opener!=='magnet_delivery'`; magnets excluded via `isMagnetOnly()`; `drifted`/`off_script` both shown as Drifted; `/N posts` uses `windowPosts`; `fuState`/`magnetFuState` are mutually exclusive. | Kept, moved into `hq-core.js` so the Slack report uses the identical functions. | SQL checks S1–S6 below |
| C4 | Two identical tiles ("Lead reply rate" and "Response times → Reply rate") on the DMs tab. | Merged into one Response-times panel. | visual |
| C5 | `relTime()` returned "just now" for a **future** timestamp (negative diff). | Returns "in Xh/Xd". | core test |
| C6 | Warm-lead tracker counted an inbound DM as "Replied" with no label. | Label reads "Replied or messaged you first". | visual |
| C7 | Applications funnel mixed a hand-set outcome ("Call booked") with DM stages without saying so. Answered / booked / showed / closed are not measurable until GHL. | Funnel shows Opened → Applied → Good fit → In DMs (name match) → then **Answered / Booked / Showed / Closed** from the hand-set outcome only, each labelled "marked by hand"; "–" with the reason when nothing is marked. | fixture |
| C8 | `System status` had hard-coded schedule text ("daily ~3:15am", "daily ~6:30am" for an ads sync that does not exist) and a 30 h freshness rule for everything. | System health panel reads `meta/*` (`lastScanAt/lastSyncAt`, `lastAttemptAt/Ok/Note`, `schedule`) and uses a per-task staleness window. | fixture |
| C9 | Supabase `TOKEN_REFRESHED` events re-ran `afterSignIn` (loading screen flash + profile refetch every hour). | Only `SIGNED_IN`/`INITIAL_SESSION` boot the app; refreshes are ignored. | manual (sign-in flow) |
| C10 | `<title>` sat inside `<body>`; `<meta charset=utf8>` misspelt; `:root` had safe-area padding. | Valid head; `utf-8`; safe-area padding moved to `body`. | lint |
| C11 | `inactive` contacts (8) were invisible. | Counted in the Warm Leads footer ("8 inactive, hidden by the scan"). | visual |

## D. Findings — dead or wrong code

| # | Issue | Fix |
| --- | --- | --- |
| D1 | `esc` defined three times (`escA`, `esc`, routine `esc`); `pad`/date helpers duplicated in the Routine script. | Single `HQ.esc`, `HQ.pad`, `HQ.addDays` etc. in `hq-core.js`. |
| D2 | Stale labels: "Refreshed every morning from Instagram" (likes scan), "daily ~6:30am" ads, "Run the Instagram content scan (claude/ig-content-scan-v1-prompt.md)". | Labels come from `meta` or were rewritten. |
| D3 | `funnel` field written by the scan is ignored by the page (by design) — documented in code so nobody "fixes" it the other way. | Comment. |
| D4 | `.r-nav .btn` CSS never used; `#appsX span{overflow:visible}` leftover; `state.tfLoaded/igLoaded/adsLoaded` flags set in three places. | Removed / unified in the data layer. |
| D5 | `ping_test*` SQL functions in the database are leftovers from the invite trigger debugging. | Left alone (database is off limits beyond additions) — listed for Jordan. |

## E. Findings — performance

- Old: 16 pollers × every 15 s → each one called `renderAll()` (14 render functions, every tab,
  every time) = roughly **64 full re-renders a minute** plus a 60 s timer re-rendering 8 panels.
- New: the data layer hashes each snapshot and **skips unchanged data**; changes mark the
  affected tabs dirty; one `requestAnimationFrame` render pass draws **only the visible tab** plus
  the two global strips (coverage banner, tab badges). Switching tabs renders that tab once if dirty.
- Measured in Playwright (`tests/perf.test.js`): render calls per minute with the fixture replayed
  every 15 s — old file ≈ 60+, new ≈ 4 (one per changed table on the active tab).

## F. Findings — states

Every panel now has four states: loading ("Loading…" only while the first poll is in flight),
empty ("Nothing here yet. The first DM scan fills this."), error (console + offline banner), and
"scan hasn't run" (from `meta`). `NaN`/`undefined` cannot reach the DOM: all number formatting goes
through `HQ.num()`/`HQ.pct()` which return "–" for null/NaN, and the Playwright suite greps every
tab's text for `NaN`, `undefined`, `null` and `Infinity`.

## G. Findings — accessibility and mobile

| # | Issue | Fix |
| --- | --- | --- |
| G1 | `role="tab"` buttons had no arrow-key navigation. | Left/Right/Home/End move focus and select. |
| G2 | Tab buttons at ≤520 px were 10.5 px text with ~30 px height; `.icon-btn` 28 px; `.r-x` ~24 px. | Bottom tab bar on phones (56 px rows), all tappable controls ≥44 px. |
| G3 | 9 tabs in one pill overflowed sideways with the scrollbar hidden. | Phones: bottom bar with 5 primary tabs + "More". Desktop: full row. |
| G4 | Trend lines were blue/orange/green/purple (off-brand) and colour was the only cue. | Brand series + dash patterns + markers; legend keyed by shape as well. |
| G5 | No `prefers-reduced-motion` handling. | Transitions disabled under reduced motion. |

## H. Findings — security

- All rendered strings pass through `esc()`; re-checked every `innerHTML` in the new file.
- No secrets in the file: only the public anon key (RLS protects rows). `grep -n "sk_live\|sk_test\|service_role" index.html` → 0.
- Stripe: new tables are readable only by admins via RLS (`is_admin()`), not just hidden. No write
  calls to Stripe exist (`grep -rn "stripe" --include=*.ts --include=*.js --include=*.html` shows
  only GET endpoints in `supabase/functions/stripe-sync`).
- The hourly `cron.job` embeds a bearer token in its SQL command (set up before this audit). It is
  not printed anywhere by HQ. Listed for Jordan under "Needs Jordan" to confirm it is the anon key.

## I. SQL spot-checks (formulas vs rows)

Run on the live database at 15:40 Sydney, 21 Oct, right after the 15:08 DM scan. The same rules are
implemented in `hq-core.js`; the Playwright suite asserts the page shows the same numbers for a
fixture export (plain-JS recomputation, no hq-core), so SQL → core → DOM agree by construction.

| # | Check (plain-English rule) | SQL result | HQ (fixture of the same rows, `tests/ui.test.js`) |
| --- | --- | --- | --- |
| S1 | Waiting on you: lead, not N/A, last sender = lead, status active/empty, not liked-only | 23 | `#kWaiting` = independent count (asserted) |
| S2 | Outbound openers, all time: verified thread, direction outbound, opener ≠ magnet_delivery | 111 | `#kReplyNote` "x of 111 openers" |
| S3 | …of which replied (firstReplyAt set) | 18 | reply rate 16% |
| S4 | Magnet leads (opener = magnet_delivery, verified) | 49 | `#magMetaLine` "… magnet leads" (asserted) |
| S5 | Unread placeholders (`pending-*`, no threadId) — outside both funnels | 330 | coverage banner "330 chats still only seen from the inbox preview" |
| S6 | Applications, last 30 Sydney days (`tf_daily.completed`) | 3 | `#appsDone` (asserted) |
| S7 | Form opens, last 30 Sydney days (`tf_daily.visits`) | 27 | `#appsOpens` (asserted) |
| S8 | Warm leads = super_engaged + close_friends | 71 | `#countSuper` + `#countClose` (asserted) |
| S9 | Applications with no outcome, last 14 days | 1 | Applications badge (asserted) |
| S10 | Drift verdicts (`drifted` or legacy `off_script`) in the last 7 days | 2 | Script review feed summary |
| S11 | `dm_threads` rows | 544 | — |

RLS check (run inside a rolled-back transaction with a temporary `stripe_summary` row): limited user
sees 0 rows of `stripe_summary` and `stripe_subscriptions` (and 544 of `dm_threads`, as before);
admin sees 1; anon sees 0. Verified 21 Oct.

## J. Scheduled tasks — what changed (Phase D results)

| Task | Action | Result |
| --- | --- | --- |
| DM scan (`trig_01Vt9c4z…`) | Re-enabled via the routines API (it was suspended `device_absent`, not broken). Kept the v4 prompt. Model stays Opus: device-bound routines refuse an unsigned model patch; changing it needs Jordan in the routine's settings. | Fired immediately at 15:08 Sydney: "Primary and General both reached rows older than the window (no stall)", wrote `meta/dmScan` 15:28. Next 18:07. |
| Likes scan (`trig_01KeUsHa…`) | Re-enabled. Same model note. | Fired at 15:16 Sydney, wrote `meta/scan`. Next 3:15. |
| Morning Slack report (`trig_011jUZRx…`) | Prompt rewritten: it now reads `meta/todayBrief.slack` (written hourly by `hq-brief` from `hq-core.js`) and sends it verbatim, rebuilds once if stale, and records `meta/morningReport {sentAt, ok, error}` so System health shows it. Model → Sonnet. | First run 22 Oct 6:47. |
| Content scan | Built as a Claude Desktop scheduled task on the Mac mini (`hq-content-scan`, 4:30 daily, Claude in Chrome, read-only, incremental, stall detection, always writes `meta/igScan` with `lastAttemptAt/Ok/Note`, push on failure). The cloud routines API refuses to create a new device-bound routine without a signed session request, so it lives beside the other Mac tasks instead. | Runs while the Claude app is open on the Mac mini (same condition as the other scans). First run 22 Oct 4:32; the 30-day backfill happens over the first runs (15 posts per run). **Needs Jordan once:** open the task in the Claude app's Scheduled list and press "Run now" to pre-approve its Chrome + Supabase tools, otherwise the first unattended run can pause on a permission prompt. |
| Typeform sync | Unchanged (healthy). | — |
| Google Calendar → Routine | Unchanged (healthy). | — |
| Stripe sync | New: edge function `stripe-sync` + `cron.job` 2 (`35 * * * *`). | Ran once: `{"ok":true,"connected":false}` (no key in Vault yet). |
| Today brief | New: edge function `hq-brief` + `cron.job` 3 (`40 * * * *`). Fetches `hq-core.js` from the live site so there is one copy of the maths. | Works once `main` is deployed (the function fetches `https://jordantornatore-rgb.github.io/tasteform-hq/hq-core.js`). |
| Ads sync | Not built: Meta connector not connected; the Ads tab and Funnel → Paid show "paused, no data". | Needs Jordan. |
| GHL pull | Not built: `meta/ghlSync {connected:false}`, `ghl_secret()` ready for a Vault token `ghl_readonly_token`. | Needs Jordan. |

Collision check after changes (Sydney): 3:15 likes → 4:30 content → 6:07 DM → 6:12 calendar → 6:23 Typeform → 6:35 Stripe → 6:40 brief → 6:47 report. No two Mac-mini (Chrome) tasks overlap; the cloud jobs are independent.

