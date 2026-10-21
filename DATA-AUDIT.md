# TasteForm HQ — data audit (22 Oct 2026, 08:30–09:30 Sydney)

Every number on the page, where it comes from, how often it must be refreshed to be trustworthy, how fresh it was this morning, and what was done about it. "Verdict" is about the data, not the page: the page itself passed 391 browser checks and 19 unit checks against a fresh export of these same rows this morning.

## 1. Source by source

| Data (where it shows) | Table / doc | Fed by | Needed cadence (why) | Freshness this morning | Verdict | Action taken |
| --- | --- | --- | --- | --- | --- | --- |
| DM pipeline, waiting on you, follow-ups, magnets, setter funnel, Today actions | `dm_threads` (618 rows, 578 leads) | DM scan, Chrome on the Mac mini | **5×/day** — a reply waiting 4 h is already late; the 6:07 run must land before the 6:47 report | Last scan **6:07 today** (both inboxes read to the window end). 170 rows written in 24 h. | **Fresh but shallow**: 248 verified threads, of which **142 not re-checked in 24 h** and 26 never verified; **232 "pending" placeholders** still only seen from the inbox preview (no link, no funnel); 14 of the 22 "waiting" leads have label-only times (≈); 42 follow-ups you marked "sent" in HQ haven't been reconciled against the real thread yet. | v5 prompt: the 22:07 run is now a 50-minute **backlog run** that re-verifies every lead older than 24 h, resolves 30 placeholders, reconciles your manual marks and writes every script review. Merge-only writes (`hq_merge`) so no run loses minutes to approval prompts. |
| Messages per day, outreach pace, trends | `dm_daily` (28 days) | DM scan (recomputed from `dailyActivity`) | 5×/day with the scan | 21 Oct = 15 openers / 14 replies, written 7:21 today. Matches the thread-level sums exactly for every day (checked 9–22 Oct). | **Correct.** Gaps on 9, 11, 13, 15, 16 Oct are days the old scan didn't run; the page draws them as "no scan", not 0. | None needed. |
| Script review feed | `script_reviews` (53) | DM scan step 5 | Daily is enough (coaching feedback) | **Only 3 reviews in the last 7 days**, newest 21 Oct 18:29 — the old scan kept skipping reviews "for time". | **Stale.** | Reviews are mandatory on the 22:07 backlog run. |
| Warm Leads board, warm-lead tracker | `contacts` (155), `posts` (6) | Likes scan, Chrome | **Daily** (likes accumulate over days; the board is for the morning) | Scan ran **3:18 today**; every super/close row touched in the last 48 h; 6 posts stored (window still building toward 20). | **Fresh and correct** (8 super engaged, 63 close friends). | None. Window reaches 20 posts as new posts age past 24 h. |
| Funnel → scorecard, posts & reels, day-by-day, Today "posts published", reach | `ig_posts` | Content scan (never scheduled before) | **Daily** (Insights change daily; stories expire in 24 h) | **2 rows from 19 Oct, no stage tags** — this is the "no Instagram content" you saw. | **Was dead.** | **Backfilled by hand this morning in your Chrome: 17 posts/reels from 27 Aug–13 Oct**, exact posting times decoded from the media ids, every one tagged (stage / CTA / keyword / effort). `meta/igScan.backfillComplete = true`. The daily task `hq-content-scan` takes it from here once it is switched on at the Mac mini (section 3). |
| Story CTAs, story→application matching | `ig_stories` | Content scan | Daily (stories expire in 24 h; the archive keeps them) | 1 story (19 Oct). | **Thin.** | Not backfilled by hand: the web app only shows story insights inside the viewer's "Seen by" sheet, one story at a time. The scheduled scan is written to read it; nothing was estimated. |
| Applications, form opens, good fit, sources, Today "applications" | `tf_responses` (36), `tf_daily` (127), `meta/typeformSync` | `typeform-sync` edge function + pg_cron | **Hourly** | Last sync 08:23 today; 24 of 24 runs in the last day succeeded. | **Correct and fresh.** 3 of 36 applications have an outcome marked — the rest are "New", which is accurate, not stale. | None. |
| Calls tonight (Today), Routine tab | `meta/routineCalls` | Google Calendar routine (cloud) | 5×/day | Updated 06:14 today, 8 days ahead. | **Fresh.** | None. |
| Today brief + morning Slack | `meta/todayBrief`, `meta/morningReport` | `hq-brief` hourly, report routine 6:47 | Hourly / daily | Brief 08:40; report sent 06:48 from the 06:40 brief. | **Working.** | Re-ran the brief after the content backfill so this evening's numbers include it. |
| Revenue tab, goal strip "recurring now" | `stripe_*`, `meta/stripeSync`, `meta/goal` | `stripe-sync` hourly | Hourly | Sync runs hourly and records "not connected" (no key in Vault). `currentMonthly` is still blank. | **Waiting on you** (key + current $/mo). | Nothing to fix in the data; see "Needs Jordan". |
| Ads tab, Funnel → Paid | `ads_daily`, `ads_campaigns` | none | Daily once connected | Empty. | **Not connected** (page says so). | — |
| Answered / booked / showed / signed | `tf_responses.outcome` (hand-marked) | you, on the Applications tab | As you work the list | 3 outcomes marked. | Honest. | GHL pull would automate it (needs a read-only token). |

## 2. Scheduled jobs — the full picture after today

| Job | Runs where | Cadence (Sydney) | Status this morning | Model |
| --- | --- | --- | --- | --- |
| DM scan (cloud routine, v4 prompt) | claude.ai → Chrome on the Mac mini | 6:07, 10:07, 14:07, 18:07, 22:07 | ✅ ran 6:07 (coverage: both inboxes to window end) | Opus (API refuses a change; routine settings on claude.ai) |
| Likes scan (cloud routine, v4) | same | 3:15 | ✅ ran 3:18 | Opus |
| Content scan `hq-content-scan` (Mac task, v5) | Claude app on the Mac mini | 4:32 daily | ⛔ **switched off** — its test run paused on a tool approval (default permission mode on this Mac) | Sonnet once running |
| DM scan `hq-dm-scan` (Mac task, v5) | same | 6:07, 10:07, 14:07, 18:07, **22:07 backlog run** | ⛔ switched off (same reason) | Sonnet |
| Likes scan `hq-likes-scan` (Mac task, v5) | same | 3:15 | ⛔ switched off (same reason) | Sonnet |
| Typeform sync | Supabase cron → edge fn | hourly :23 | ✅ 24/24 | — |
| Stripe sync | Supabase cron → edge fn | hourly :35 | ✅ (not connected) | — |
| Today brief | Supabase cron → edge fn | hourly :40 | ✅ 18/18 | — |
| Google Calendar → calls | cloud routine | 6:12, 9:12, 12:12, 15:12, 18:12 | ✅ | Sonnet |
| Morning Slack report | cloud routine | 6:47 | ✅ sent 6:48, verbatim from the brief | Sonnet |

No two Chrome jobs overlap: 3:15 likes → 4:32 content → 6:07 DM → 6:40 brief → 6:47 report.

## 3. Where the scans run (updated 22 Oct, afternoon)

There are **two separate task lists** and that caused confusion:

- **claude.ai → Scheduled tasks** (the cloud routines, bound to the Mac mini). These are the ones Jordan opened today: DM scan and likes scan are **on, Auto, running** (likes ran 3:15 and 8:40; DM ran 6:07). They still carry the older v4 prompts and Opus, because the API refuses to edit a device-bound routine's instructions or model; the edit box on claude.ai can.
- **Claude app on the Mac mini → Scheduled** (local tasks `hq-dm-scan`, `hq-likes-scan`, `hq-content-scan`, v5 prompts, Sonnet). Off: a task created remotely starts in "default" permission mode and pauses on its first tool call; only the app on that machine can set Auto.

Simplest path, from the phone: in each cloud routine's edit box, replace the Instructions with the matching file in `scans/` (v5 prompt), switch the model to Sonnet, save. For content, create a third routine from `scans/content-scan.md` at 4:32 daily. The local tasks then stay off and nothing runs twice.

## 4. Findings that are about the business, not the data

- **Posting cadence vs plan.** Plan is 10 pieces a week (4 top, 3 mid, 2 proof, 1 hard CTA). Actual, last 8 weeks: 17 posts total ≈ 2 a week; 0 posts since 13 Oct; week of 19 Oct = 0/10. The scorecard now shows this honestly.
- **What works.** The three keyword-recipe reels did almost all the reach: LOADED (188k views, 1,532 saves, 29 follows), GYROS (119k, 3,331 saves, 104 follows), BIG (31k, 745 saves, 40 follows). Talking-head/mindset pieces run 2–8k views. Proof posts (Nik, Eric) 2.2–2.5k views, ~0 saves.
- **Pipeline health.** 22 leads waiting on a reply, 18 of them for more than a week; 86 ghosted; reply rate 16% against the 35% target over 111 openers.

## 5. Checks run (so you can repeat them)

- Freshness per table: `select count(*), max(updated_at) from <table>` and the `meta` doc fields `lastScanAt / lastSyncAt / lastAttemptAt`.
- `dm_daily` vs threads: openers per day from `dm_daily` equal the sum of `dailyActivity[day].o` over outbound leads for every day 9–22 Oct.
- Cron: `select jobname, status, count(*) from cron.job_run_details … group by 1,2` → all succeeded.
- Page vs rows: `tests/ui.test.js` with a fresh anonymised export (391 checks) and `tests/core.test.js` (19).
