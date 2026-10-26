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
| Story CTAs, story→application matching | `ig_stories` | Content scan | Daily (stories expire in 24 h; the archive keeps them) | 2 stories (19 Oct, 20 Oct) after the first v5 run at 11:50 on 22 Oct. | **Thin, now filling daily.** The web archive gives only the "Seen by" count per story; taps, replies, link clicks and navigation need the mobile app, so those columns stay blank and are labelled as such. | Prompt v5.2 walks the whole archive back 14 days, keys stories by the archive id and dates them from Instagram's age label (marked inexact). |
| Applications, form opens, good fit, sources, Today "applications" | `tf_responses` (36), `tf_daily` (127), `meta/typeformSync` | `typeform-sync` edge function + pg_cron | **Hourly** | Last sync 08:23 today; 24 of 24 runs in the last day succeeded. | **Correct and fresh.** 3 of 36 applications have an outcome marked — the rest are "New", which is accurate, not stale. | None. |
| Calls tonight (Today), Routine tab | `meta/routineCalls` | Google Calendar routine (cloud) | 5×/day | Updated 06:14 today, 8 days ahead. | **Fresh.** | None. |
| Today brief + morning Slack | `meta/todayBrief`, `meta/morningReport` | `hq-brief` hourly, report routine 6:47 | Hourly / daily | Brief 08:40; report sent 06:48 from the 06:40 brief. | **Working.** | Re-ran the brief after the content backfill so this evening's numbers include it. |
| Revenue tab, goal strip "recurring now" | `stripe_*`, `meta/stripeSync`, `meta/goal` | `stripe-sync` hourly | Hourly | Sync runs hourly and records "not connected" (no key in Vault). `currentMonthly` is still blank. | **Waiting on you** (key + current $/mo). | Nothing to fix in the data; see "Needs Jordan". |
| Ads tab, Funnel → Paid | `ads_daily`, `ads_campaigns` | none | Daily once connected | Empty. | **Not connected** (page says so). | — |
| Answered / booked / showed / signed | `tf_responses.outcome` (hand-marked) | you, on the Applications tab | As you work the list | 3 outcomes marked. | Honest. | GHL pull would automate it (needs a read-only token). |

## 2. Scheduled jobs — what the four days of v5 showed (26 Oct)

Every routine fired on time and ended "success", but each run lasted 1–4 minutes, including the 22:07 backlog runs that were meant to take 50. The model treated the deep work ("as time allows") as optional and stopped as soon as the inbox walk was done. Net effect after four days: 321 placeholders still unresolved, 718 leads not re-verified in 24 h, 4 script reviews in 7 days, the morning brief saying "DM INCOMPLETE · 412 chats not read yet" every day, and push notifications admitting "backlog re-verify was not done". The data that *was* written was correct; the problem was coverage, not accuracy.

| Job | Schedule (Sydney) | v6 fix | Status |
| --- | --- | --- | --- |
| DM scan (5× daily) | 6:07, 10:07, 14:07, 18:07, 22:07 · 25 min | Queue-driven re-verify by thread URL, 5 placeholders per run, finish gate, self-reported `stoppedEarly` | prompt in `scans/dm-scan.md`, waiting to be pasted |
| DM backlog (new) | 22:40 · 50 min | Four SQL queues, 10-row batches, opened by URL, reviews + dm_daily at the end | `scans/dm-backlog.md`, routine to be created |
| Likes scan | 3:15 · 30 min | Big posts read in pages with progress saved every 100 names; tiers every night | `scans/likes-scan.md`, to be pasted |
| Content scan | 4:32 · 25 min | Same discipline block; hq_merge only; explicit queue | `scans/content-scan.md`, to be pasted |
| Typeform sync / Stripe sync / Today brief | hourly :23 / :35 / :40 | — | ✅ |
| Google Calendar → calls | 6:12, 9:12, 12:12, 15:12, 18:12 | — | ✅ |
| Morning Slack report | 6:47 | — | ✅ |

## 2b. v6 live proof (26 Oct, 9:30–12:00 Sydney)

| Run | Minutes used / budget | Did | Self-verdict |
| --- | --- | --- | --- |
| DM scan (manual, 9:30) | 14.4 / 25 | 16 threads read, **53 waiting leads re-verified by URL**, 11 script reviews, dm_daily | `stoppedEarly: true` — queue down to 2 unread rows; placeholder step failed (search never opens a chat) |
| DM scan (scheduled 10:07) | 3.7 / 25 | 8 threads, 3 re-verified, 3 reviews; queue genuinely empty | ok — v6.1 now spends idle minutes on stale leads |
| DM backlog (manual, 10:33) | 40.5 / 48 | **200 leads re-verified** (37 manual-mark reconciliations, 163 stale), 19 reviews, dm_daily | `stoppedEarly: true` — only the placeholder queue was left, same search problem |
| Likes scan (manual, 11:25) | 14.8 / 30 | 8 posts read, window of 20 complete posts filled, **19 new Super Engaged**, 3,286 likers | ok; 3 reels sit at Instagram's visible-liker cap (~1,000 names), recorded as partial for good |
| Content scan (manual, 11:57) | 4.2 / 25 | 4 reels from the last 7 days re-read, 1 new story, 21 posts / 11 stories stored | ok; queue genuinely empty |

Four days of v5 re-verified about 10 leads a day; one morning of v6 re-verified 256 and wrote 33 script reviews. The failures the scans reported on themselves were all the same bug (resolving placeholders via Instagram search), fixed in v6.1 by matching placeholders against the inbox list instead.

## 3. Where the scans run

All Instagram scans are claude.ai routines bound to the Mac mini (Auto, Sonnet). The API can toggle them and read their logs but cannot change a bound routine's prompt or create a bound one, so prompt changes are pasted once from `scans/` (raw links in `scans/README.md`). The three backup tasks in the Claude app on the Mac mini were deleted on 26 Oct; a routine I created through the API that day came back unbound and is left disabled (named "DM scan v6 (day runs…)", safe to delete).

## 4. Findings that are about the business, not the data

- **Posting cadence vs plan.** Plan is 10 pieces a week (4 top, 3 mid, 2 proof, 1 hard CTA). Actual, last 8 weeks: 17 posts total ≈ 2 a week; 0 posts since 13 Oct; week of 19 Oct = 0/10. The scorecard now shows this honestly.
- **What works.** The three keyword-recipe reels did almost all the reach: LOADED (188k views, 1,532 saves, 29 follows), GYROS (119k, 3,331 saves, 104 follows), BIG (31k, 745 saves, 40 follows). Talking-head/mindset pieces run 2–8k views. Proof posts (Nik, Eric) 2.2–2.5k views, ~0 saves.
- **Pipeline health.** 22 leads waiting on a reply, 18 of them for more than a week; 86 ghosted; reply rate 16% against the 35% target over 111 openers.

## 5. Checks run (so you can repeat them)

- Freshness per table: `select count(*), max(updated_at) from <table>` and the `meta` doc fields `lastScanAt / lastSyncAt / lastAttemptAt`.
- `dm_daily` vs threads: openers per day from `dm_daily` equal the sum of `dailyActivity[day].o` over outbound leads for every day 9–22 Oct.
- Cron: `select jobname, status, count(*) from cron.job_run_details … group by 1,2` → all succeeded.
- Page vs rows: `tests/ui.test.js` with a fresh anonymised export (391 checks) and `tests/core.test.js` (19).
