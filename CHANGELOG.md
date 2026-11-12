# Changelog

## 3.4.0 — 12 Nov 2026 (new look)
- Whole app reskinned: matte black (flat, no wood gradient or grid lines), graphite cards with hairline borders, no drop shadows, 4–8 px corners instead of pills, brass as the only accent.
- Anton only for page titles and big numbers; section headings are small wide-tracked labels. Warnings are a hairline card with an accent edge instead of a beige slab.
- Sidebar: black, outlined TF mark, active page = brass edge + brass icon, shortcut numbers hidden. Phone bar: blurred, active item in brass, items share the width evenly.
- Light mode follows the same rules on bone instead of beige. Skin lives in one block at the end of the stylesheet ("HQ 4 skin"), so it's easy to tune or roll back.

## 3.3.0 — 12 Nov 2026 (Time)
- New **Time** page (admin only; Work → Time, and Time on the phone bar). Tap what you're doing and the clock starts. Tap the next thing and the last one stops, so the day logs with no gaps. Optional "what exactly?" detail.
- 9 areas, 41 steps: Content, Leads, Sales calls, Onboarding, Check-ins, Responses, Systems & admin, Lifestyle, Sleep.
- Day: a 24h strip, every block and every gap of 5+ min ("Untracked · Fill"), ▲/▼ energy per block, Edit / Add time. Edits replace whatever they overlap, so no minute is counted twice. Sleep across midnight splits at 00:00.
- Week: awake hours tracked out of 108, business / sleep / untracked, one strip per day, hours per area and step with energy.
- Buy back: tag each step once (Keep / Delegate / Automate / Cut). Shows the hours a week you could buy back.
- A "now tracking" pill on every other page. Uses the device's local time, so it works in Bali.
- Data: meta `time:<date>`, `timeNow`, `timeCfg`. Migration `20261112_time_meta_admin_only.sql` makes those rows admin only (needs applying).
- Tests: `node tests/time.test.js` (76 checks).

## 3.2.0 — 12 Nov 2026 (2027 Master Plan)
- Home opens with the plan: this week's main thing (section 10), the key Friday numbers against target, and clients vs the quarter target.
- New Scorecard page: the 11 Friday measures from section 11, weeks 1 to 13 from 16 Nov, green / red against the plan, "red 3 weeks running" flag, and typed-in hours and long-form.
- Leads: switch between All, Story CTA, Link in bio, Off-platform, Paid direct and Paid indirect. Each funnel runs from its first touch to sales.
- Applications now include the new apply page (one per person, test entries dropped).
- ghl-sync splits booked / showed / sold by funnel, matched on email or phone inside the function, and counts instant-form leads from the ad pipelines.
- Story links is now Funnel links: tagged links for QR / poster, referral, affiliate, collab, email and both paid funnels.
- New RPC hq_delivery_by_day (joined / left per day, counts only).

## 3.1.0 — 12 Nov 2026 (GoHighLevel connected, Stripe off)
- New `ghl-sync` edge function (read-only GETs, hourly at :47). Writes per-day counts to meta/ghlSync: sales-call bookings, calls held, showed / no-show, leads moved to Closed / Won, Instagram Leads outreach and replies. No names.
- Leads: booked calls and show-ups from GHL (show-up rate fills in as calls are marked Showed / No-show), plus an Instagram outreach section.
- Sales: closes, close rate and days to close from GHL; blank (not 0) while no lead has been moved to Closed.
- Stripe sync switched off (payments moving to Newie); money rows say "waiting on Newie".

## 3.0.1 — 12 Nov 2026 (Story links)

- Tools → **Story links**: type the sticker text, pick Lead magnet / Sticker / DM, tap **Add + copy link**. The tracked link (`tasteformcoaching.vercel.app/?utm_source=instagram&utm_medium=story&utm_campaign=<type>&utm_content=<sticker text, normalised>`) is copied and saved to `cta_links`. Each link shows how many people opened the form from it and how many applied (story sessions in `app_sessions`). The bio link (`/apply`) is at the top with Copy.
- `utm_content` uses the same normalisation as `ig_stories.linkStickerLabelNorm`, so a story's sticker joins to its applications.
- Tests: `node tests/links.test.js`; the mock client now supports `limit()`, `data->a->>b` filters and aliased selects.

## 3.0.0 — 11 Nov 2026 (Home + four areas)

- New **Home** is the first page: one line on where people drop off between content and the form, four cards (Traffic, Leads, Sales, Delivery), and at most 3 things to do today. One 7 days / 30 days / Month switch for every page, remembered per device.
- **Traffic**: new followers from posts, follower count, views, reach, non-follower %, posts, saves, shares, likes, comments, story views, best post for followers, then the hand-off to Leads (profile visits → link taps → form views).
- **Leads** is a funnel: form views → starts → applications → booked → showed, with the rate between each step and "What feeds this" under each. Starts stay blank (the Typeform sync only counts finished forms); booked, show-ups and cost per booked call stay blank until GoHighLevel and ad spend are connected.
- **Sales** (admin only): cash collected, sales closed, close rate, average sale, CAC, days from first DM to close, refunds. Blank until Stripe and GoHighLevel are connected; the page says how.
- **Delivery**: active clients, joined, left, average weeks stayed, check-ins on time (from the challenge member list via `hq_delivery_counts`, counts only, so names stay admin only), plus MRR, failed payments and LTV once Stripe is connected.
- DM numbers are off these pages while the DM scan is being fixed (`DM_SCAN_OK = false` in index.html). The DM tables, scans and the DMs / Follow-ups tabs are unchanged and still under Work / More.
- Menu: Overview (Home, Traffic, Leads, Sales, Delivery) · Work (Daily brief, DMs, Follow-ups, Magnets, Warm Leads) · Tools. Phone bar: Home, Apps, Content, More. Shortcuts 1–5 open the overview pages.
- Tests: `node tests/pillars.test.js [--fixtures dir]`; the mock client now answers `rpc()`.

## 2.9.2 — 5 Nov 2026 (lead magnets list)

- Content Engine → **Lead magnets**: every reel's lead magnet in one list, "your turn" first, with its stage, comment word, page previews (tap for full size), PDF ↗ / Survey ↗ once live, and Open reel (always the reel view with the 🧲 panel, even before it has a script). Below it, the older magnets already in Drive (guides and recipe folders), each linked, plus the Drive folder.

## 2.9.1 — 5 Nov 2026 (remove a creator)

- Scanner watchlist: a small ✕ next to each handle removes the account (marked `removed`, never deleted). Removed accounts sit under "Removed" with Undo. The Content Brain (§16) tells the Scanner to skip them and never add them back.

## 2.9.0 — 5 Nov 2026 (reel types + labelled files)

- Script editor: **What kind of reel?** Talking to camera (hooks, script, ending), Voiceover + footage (hook, voiceover, shot list, what goes on top and when), Short clip + caption (the shot, one on-screen line, 5–15 s, the caption carries the value), Carousel (slides, slide 1 the hook, caption). Switching keeps what you've typed. Formats follow the type (C formats for carousels).
- The reel sheet shows the type's parts (shot list, overlays, the shot and on-screen line) with **Change type**.
- Add reel: separate boxes for 🎥 video footage, 🎙 voiceover and 🖼 photos to put on top. The Mac files them into footage/, voiceover/ and overlays/ and edits by type.

## 2.8.0 — 5 Nov 2026 (🧲 lead magnets from a reel)

- Reel sheet: **🧲 Lead magnet**. Tap "Make lead magnet", give it a name, the comment word(s), type, who it's for and what goes in it. The Mac writes the outline (every fact with its source), you approve or send changes; it builds the PDF in the 9-5 Split style, you check the pages here; then **Build GHL + ManyChat** lets it set up the survey, email workflow and ManyChat comment trigger in your Chrome. Nothing touches GoHighLevel or ManyChat before that tap.
- "Needs you" with a reason and **Fixed, try again**; a Drive link box when it needs one. When it's live: the keyword, survey and PDF links, and anything still on you.
- The reel waits to post until its lead magnet is live (untick "Hold this reel" to let it go). Calendar bubbles show 🧲 Building / Your turn / Live.

## 2.7.5 — 5 Nov 2026 (trial reels on their own day)

- Trial reel = Yes: the reel sheet has "🧪 Trial reels start" (day + time), separate from the 📣 full reel's time in Schedule. Default is "as soon as it's approved". If the reel isn't approved by the time you pick, the trials start the moment you approve it.
- The 🧪 Trial reels bubble in the Calendar drags on its own: drop it on a day to move only the trials (same time of day). The 📣 Full reel bubble still moves the winner.
- Once the trials are booked, you can still move them until the first one goes out; the pipeline cancels and re-books them within 20 minutes. The winner keeps your time if it's still at least 1 h after the last trial.

## 2.7.4 — 5 Nov 2026 (rename a reel)

- Tap a reel's name at the top of its sheet (✎) to rename it. Enter or Save saves; Escape or Cancel leaves it. Not posted yet: saved like any edit (a scheduled reel's YouTube title is updated in Outstand too). Already posted: only HQ's name changes; the live post keeps its title.

## 2.7.3 — 4 Nov 2026 (duplicate a reel)

- ⧉ Duplicate on every reel sheet (admin): a new reel with the same title + "(copy)", hooks, visual hook, script, editing notes, CTA, caption, slides, format, funnel, location, sound and platforms. No footage, video, trials or posts. It lands in Pending scheduling at "to be filmed" (or "needs script"); drag it onto a day. The copy says "Copy of …" with a link back; the original isn't touched.
- Footage for a duplicated script goes to the original first, then the copy (the pipeline's matcher breaks the tie by `dupRoot`/`duplicatedAt`).

## 2.7.2 — 4 Nov 2026 (trial reels vs the full reel, clearly)

- Every calendar bubble and Library card says what it is: 📣 FULL REEL (posted to everyone) or 🧪 TRIAL REELS (Instagram, non-followers only), or 🖼 CAROUSEL.
- A reel that's trialled now has two linked bubbles: 🧪 Trial reels on the day they start (how many versions, waiting for your OK / n of 5 out with the best views / done, which won) and 📣 Full reel on the day the winner posts to everyone. Each points at the other ("→ Full reel Sat 4:00pm", "← Trial reels first, Wed 4:10pm"); hovering one highlights both. Automatic trials (2+ versions, 3+ days out) show too, marked automatic.
- Reel sheet: "What goes out" at the top: 1 · Trial reels (who sees them, when, status) and 2 · Full reel (the winner, where, when), or "Full reel · no trial".

## 2.7.1 — 4 Nov 2026 (drag and drop that works on a phone)

- Calendar drag and drop rebuilt: grab a bubble anywhere (title, time, thumbnail) and drop it on a day or in Pending scheduling. On a phone, press and hold for a moment, then drag: the page no longer scrolls away and cancels the drag, and it scrolls by itself when you drag near the top or bottom edge. Thumbnails no longer start the browser's own image drag; long-press doesn't open the copy menu.

## 2.7.0 — 4 Nov 2026 (Calendar tab: every video from script to posted)

- New **Calendar** tab (first tab; opens there once): one or two weeks, full width, one bubble per video on the day it posts, with its time, title, stage (Needs script, Scripted · to film, Filmed · to upload, Editing, To review, Approved, Trialing, Scheduled, Posted, Needs you), the 🏆 winner chip, format and location, and a thumbnail to play finished edits. 🧪 trial reels and 🎥 film days show on their days.
- **Pending scheduling** tray on top: scripts saved with "Not scheduled yet" (new option in the script editor) and anything without a day. Drag a bubble onto a day (or pick a day) to schedule it; drag one into the tray to take it off its day. The pipeline holds an approved reel that's pending scheduling until it has a day.
- **Stage chips** filter the calendar. "Scripted · to film" opens the filming board, grouped by location, with "Film on…" per location (sets `filmDate`) and Select all.
- **Tick bubbles** to change several at once: stage (Needs script, Scripted · to film, Filmed · to upload, To review, Approved, Skip) or film day. Trialing, scheduled and posted reels aren't changed this way.
- Reel sheet for scripted reels: "📱 Filmed it (not uploaded yet)" (`shotAt`) and a film day.
- The Library links to the Calendar instead of showing the small calendar. Fix: ticking a checkbox no longer blocks the page from redrawing.

## 2.6.6 — 4 Nov 2026 (the winner in the schedule)

- A trial reel now sits in the calendar and Up next at the time its winner posts, with a 🏆 Winner chip. Before the trials start (Trial reel: Yes) that time is projected: 72 h after the first pipeline run after you approve, or the time you moved it to if that leaves 24 h+ after the trials. The days the trial reels go out show 🧪 markers.
- Winner panel on the reel: which version wins (Automatic by the funnel's number, or pick v1…vN; live views shown), which platforms the winner goes to, and "Decide now and post the winner". Saved as `winnerPlan {pick, platforms, decideNow}`. Caption, LinkedIn and title edits go out with the winner; Schedule moves the winner's time.

## 2.6.5 — 4 Nov 2026 (sounds grouped by video type)

- The Sound list is grouped the way @martinwang.mp4's "Background music for short form" reel groups it: Emotional, Tactical / educational, A challenge, Storytelling, Deep (3 songs each, all full tracks), then everything else under (Other). Picking a grouped song says when to use it.
- "Group by video type" toggle above the list switches to one A–Z list (remembered on this device).

## 2.6.4 — 4 Nov 2026 (Trial reel? dropdown)

- Add a filmed reel and every reel's post sheet: "Trial reel?" Yes = every version (one is fine, finished edits included) goes out as an Instagram trial reel once approved, and the winner posts to everyone 72 h later. No = posts as it is at its slot. Saved as `trialChoice` (on/off); reels without a choice keep the automatic rule.

## 2.6.3 — 4 Nov 2026 (whole songs, Instagram-style picker, trial versions of your own edits)

- Sound section: the whole song is drawn as a waveform with a box as long as your video. Drag the box (or tap where you want it, or use the arrow keys) to pick the part, like Instagram; the bars inside light up and the time shows above. A dashed line marks the chorus (or Instagram's part of the song), with a button to jump back to it. The fine-tune slider stays underneath.
- Picking a different song puts the box on its chorus. "▶ Play this part" loops the part in the box while you drag; "▶ Preview with my video" follows the box live.
- The bank's songs are now the full tracks (36 of 43; five rare clips and two original sounds stay as clips). A saved start is measured in the full song (`sound.startBase: "full"`).
- Add a filmed reel → Finished edit: add 2 or more versions and they're trialled as v1…vN like any reel; one file still posts as it is.

## 2.6.2 — 4 Nov 2026 (pick the part of the song)

- Sound section: "Start the song at" slider (`sound.startS`), "▶ Play the song from here" (20 s at full volume) and, on finished edits you added, "▶ Preview with my video": your original video with the song underneath at the chosen point and volume, live, with the sliders working while it plays. Saving re-renders the video from that point. Bank tracks are on private Storage (`content-previews/sounds/<id>.mp4`, `content_sounds.previewPath`).
- A preview shows "This preview is the previous mix" while a new sound is being mixed in.

## 2.6.1 — 4 Nov 2026 (add reels you've already filmed)

- Fix: uploads sent the sign-in token twice in one header ("Invalid Compact JWS"); it's now set once per request. A failed upload is saved as `footageUpload.status: failed`, shows "Upload failed · add the footage again", and retrying in the same sheet reuses the reel instead of creating another.
- Files over 45 MB upload as 45 MB parts (the storage plan caps one object at 50 MB); the Mac joins them and checks the size. Tested with a 52 MB file.
- Every format dropdown and chip shows the format's name next to its code (F7 · Diagnosis talking head, C3 · Food list carousel …).

- **+ Add filmed reel** (Library) and **Filmed this? Add the footage** (post sheet of a to-film reel): attach raw footage or a finished edit to an open slot or a new reel, uploaded from the phone (resumable, private bucket `content-footage`, 7-day signed links for the Mac) or linked from a folder already in `footage/` on the Mac. Finished edits skip editing and trials and come to you for approval.
- Footage status chips on cards and a Footage block in the post sheet.
- `supabase/migrations/20261104_content_footage_bucket.sql` (bucket + admin-only policies, applied).

## 2.8.0 — 4 Nov 2026 (Analytics tab)

- New **Analytics** tab (Growth group; phone → More), Metricool-style, for everyone signed in. Period 7 / 30 / 90 days (Instagram's own ranges), each compared with the window before it.
  - **Overview**: posts, views, accounts reached, net followers, engagement per 1,000 views, typical (median) reel, watch time, saves · shares, each with ▲/▼ vs the previous window; a plain-English read (posting volume vs per-post views, flags when one post carries most of the views, days since last post); median views per post by type; top 5 posts.
  - **Posts**: views (log) vs average watch time for every post in the last 90 days, median lines, outliers highlighted and listed as "Make more like these" (falls back to engagement per 1K views until watch time is collected); 13-week posting heatmap.
  - **Audience**: followers, net followers, follows, unfollows with deltas; net followers per day; "who you gain and lose" is explained as not measurable rather than guessed.
- Supabase: `ig_account_daily` (one row per Sydney day: profile follower count + Instagram's last 7/30/90-day reach, views, follows, unfollows), added to `hq_merge`. Migration in `supabase/migrations/20261104_ig_account_daily.sql`.
- Content scan prompt **v7** (`scans/content-scan.md`): new step 2b writes `ig_account_daily`; reels now store `watchTimeSec`, `avgWatchSec`, `skipRatePct`; backfill of watch numbers for the last 90 days and of posts back to 90 days.
- `HQ.igAnalytics` in `hq-core.js` (unit test in `tests/core.test.js`); `tests/analytics.test.js` (synthetic data, 54 checks: every view × period × layout, no NaN, no overflow, views KPI equals an independent sum, zero console errors).

## 2.7.0 — 4 Nov 2026 (Email tab)

- **Email** tab (admin only): Up next (each email in the GHL sequence, subject + body, draft/live, who is due it), Sent (every send with opened / replied and tags), Performance (reply %, opens and unsubs per email, split by recipe, job and country tags). See `EMAIL.md`.
- Supabase: `email_steps`, `email_events` (admin-only RLS), `meta/emailSync`; edge function `ghl-email-event` takes GHL workflow webhooks (refuses everything until the `GHL_WEBHOOK_KEY` secret is set). The 5 emails of the recipe opener sequence are seeded as drafts.
- `HQ.emailStats` in `hq-core.js` with a unit test.
- The live-sync shim now pages tables in 1,000-row chunks, so no table is silently cut at PostgREST's row cap.

## 2.6.0 — 4 Nov 2026 (Content Engine workflow v2: Jordan writes the scripts)

- **Script editor** (full screen on a phone, side panel on desktop) from "Turn into a reel" in the Idea Bank, any open slot on the calendar or board, "+ New reel" (Library and under every calendar day) and "Edit script" on a post: title, up to 5 spoken hooks with the idea's hooks as tap-to-use chips, visual hook (the idea's visual hooks as chips), the script (auto-grows, word count, read time), editing notes, CTA, format / funnel / location, a slot picker over the open slots of the next 3 weeks or a new day + slot, the source idea panel, the old AI beats read-only. Local draft autosave every 3 s. Saves through `content-update` (`create` for new reels).
- **Filming sheet**: every to_film script for the next 2 weeks by location, hooks numbered, script in big type, printable.
- **Open slots**: `needs_script` shells are dashed "Write script" cards; "Needs script" and "Trialing" join the pipeline strip and the status stepper.
- **Phone preview** on every card with a render (▶; desktop hover plays muted; one video at a time): 9:16 frame, username row, caption with "…more", time, platforms, sound line, the 5 trial versions as tabs with live numbers, 🏆 winner with its why and confidence, Approve / Request changes. Plays `previewUrl`, a version's media, or a 1-hour signed URL from `content-previews`; a failed load says so and flags `video.previewBroken`.
- **Post sheet**: Jordan's script, visual hook, editing notes and CTA replace the beats (old beats read-only); trial reels with each version's numbers and the winner; ⭐ "Make this the gold standard for <format>"; YouTube claim-risk note; LinkedIn shows the TasteForm tag and warns when it's missing; sound editor for mixed-in music (bank track + volume); Outstand wording.
- **Idea Bank**: lane chip and filter, sort by lane/funnel, pinned on top, "How to make it yours", the source reel with stage-right numbers (`–` with the reason when not public), follower jump, similar high performers, hook options, visual hook ideas and talking points with Copy.
- **Editing standards** panel (gold reel per format, inspo reels saved to `meta/autopost.formatInspo`) and **Turn into an ad** on Performance.
- `supabase/functions/content-update` and `content-reschedule` sources are now in the repo (they also keep a separate YouTube post in line; deploy pending).
- Tests: Content Engine v2 block in `tests/ui.test.js` with committed synthetic rows; `HQ_ONLY_CONTENT=1` runs just that block plus the edge cases.

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
