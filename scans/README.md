# Scan prompts (v6)

Four routines on claude.ai (Scheduled tasks), each bound to the Mac mini, permission **Auto**, model **Sonnet**. The Instructions box of each routine holds the matching file below, pasted verbatim (copy from the *raw* link so nothing is reformatted).

| Routine on claude.ai | Schedule (Sydney) | Budget | Prompt file |
| --- | --- | --- | --- |
| TasteForm HQ — DM scan (5× daily, Mac Mini) *(existing)* | 6:07, 10:07, 14:07, 18:07, 22:07 | 25 min | [dm-scan.md](https://raw.githubusercontent.com/jordantornatore-rgb/tasteform-hq/main/scans/dm-scan.md) |
| TasteForm HQ — DM backlog (nightly, Mac Mini) *(new)* | 22:40 daily | 50 min | [dm-backlog.md](https://raw.githubusercontent.com/jordantornatore-rgb/tasteform-hq/main/scans/dm-backlog.md) |
| Warm Leads Board — daily Instagram scan (Mac Mini) *(existing)* | 3:15 daily | 30 min | [likes-scan.md](https://raw.githubusercontent.com/jordantornatore-rgb/tasteform-hq/main/scans/likes-scan.md) |
| Content Scan *(existing)* | 4:32 daily | 25 min | [content-scan.md](https://raw.githubusercontent.com/jordantornatore-rgb/tasteform-hq/main/scans/content-scan.md) |

No two Chrome jobs overlap: 3:15 likes → 4:32 content → 6:07 DM → 6:40 brief → 6:47 report … 22:07 DM (ends by 22:32) → 22:40 backlog (ends by 23:28).

## What v6 changes (26 Oct 2026)
Every run before v6 ended "success" after 1–4 minutes and skipped the deep work, so the backlog never moved (321 placeholders, 718 leads unverified for 24 h+, 4 script reviews a week) and the morning brief kept saying "DM INCOMPLETE". v6 fixes the cause, not the symptom:

- **Run discipline block** at the top of every prompt: compute START and DEADLINE, work a SQL-defined queue in batches, check the clock after every batch, and pass a *finish gate* before writing the health row. Stopping with more than 5 minutes left while the queue is non-empty is a failed run **by the scan's own definition**: it writes `stoppedEarly: true` and `lastAttemptOk: false` itself, and the dashboard shows "Stopped early" in red.
- **Backlog is its own routine** (22:40, 50 min) with four explicit queues (manual marks → waiting leads → stale leads → placeholders), opened by thread URL instead of search, so a night processes 60–120 rows.
- **Day runs re-verify by URL** too (leads waiting on Jordan, 10 per batch) and resolve 5 placeholders each.
- **Likes scan reads big posts in pages** and saves progress every 100 names, so a 900-like reel is finished over a few nights instead of skipped forever; tiers are recomputed every night.
- **Health rows** carry `minutesUsed`, `budgetMin`, `queueRemaining`, `stepsDone`, so the System health panel can say exactly what a run did.

The API cannot edit a device-bound routine's prompt or create one that is bound and on Auto, so these four pastes are done once in the claude.ai edit box. Backup copies of the old v5 prompts are in git history; the Claude-app tasks on the Mac mini were deleted on 26 Oct so nothing shows as failing there.
