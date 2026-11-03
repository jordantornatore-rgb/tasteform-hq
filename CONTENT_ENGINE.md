# Content Engine tab

The **Content Engine** tab (sidebar → Growth, phone → More → Content Engine, hash `#content`) is the front end for the three-times-weekly creator **Scanner**, the Sunday **batch** that writes the weekly plan, and the Sunday **review**. Everyone signed in can read it; only the `admin` profile can change anything. Every write is a merge into the row's `data` (the `db.doc().update()` path in `index.html`), so a scan or batch never loses fields the page didn't touch.

All dates are Sydney days (`HQ.sydNow`, `HQ.weekStart`, `HQ.fmtDay` from `hq-core.js`). Numbers are exact or `–` with the reason next to them; nothing is estimated.

## Views (segmented control at the top; Library is the default)

| View | Reads | Writes (admin only) |
| --- | --- | --- |
| **Library** | Every `content_queue` row. Pipeline strip (To film → Filmed → Editing → Needs your OK → Approved → Scheduled → Posted, plus red Needs Jordan / Errors counts, each a filter), the `meta/autopost` last-run line, **Needs you** (rows in `needs_jordan` with the reason), **Waiting for you** (`awaiting_approval` rows with the inline video preview, planned time, caption, sound), a Mon–Sun **calendar** (drag to another day, "Move to…" picker, 15-minute time dropdown 6:00am–11:45pm with quick picks), **Up next** (scheduled, grouped by Sydney day, countdown under 24 h), **Posted** (permalink + 24 h / 7 d metrics), everything else by date, filters (status, platform, format, funnel, date range, search), and the collapsible "Rules the editor has learned" (`meta/autopost.learnings`). | **Auto post** switch → `meta/posting.autoPost` + `autoPostChangedAt` (turning it on asks for confirmation). **Approve** → `status:"approved", approval.approvedAt`; **Approve all** (confirm). **Send feedback** → appends `{id, at, part, text, resolved:false}` to `feedback[]` and sets `status:"changes_requested"`. **Mark fixed** → `status:"filmed"`. **Re-edit video** → `reEditRequested:true`. **Pull from schedule** (confirm) → `posting.cancelRequested:true`. Moves and time changes go through the `content-reschedule` function; every section of the post sheet is edited through the `content-update` function (both admin-only, both refuse posted posts). |
| **This week** | `content_queue` rows whose `date` falls in the Mon–Sun week (or whose `weekStart` matches when `date` is missing). Prev / Next moves a week. Progress bars count filmed / approved / posted out of the 18 slots the plan aims for (skipped slots are excluded). "Filming list" groups unfilmed slots by `location` (desk, car, mirror, kitchen, gym, outside, then anything else). Tap a card for the script sheet: 5 hooks, beats (`body[]`), ending, caption, LinkedIn version, slides, each with Copy. | Status stepper `to_film → filmed → edited → approved → scheduled → posted` and "Skip this slot" merge **only** `status` and `statusAt` (ISO). Non-admins see the stepper disabled. |
| **Idea Bank** | `content_ideas`, newest `foundAt` first. Filters: status, funnel, format, type (reel/carousel), Officemaxxing. Stat line is `multiple`× the creator's median when the Scanner stored it, otherwise views, otherwise likes / shares, otherwise `–`. Link goes to `url` or `instagram.com/p/<shortcode>/`. Empty state: "Scanner runs Mon/Wed/Fri. First briefs land after the next run." | **Skip** → `{status:'skipped', statusAt}`. **Use next week** → `{status:'new', pinned:true, pinnedAt}` (the Sunday batch takes pinned ideas first). Unpin → `{pinned:false}`. Restore → `{status:'new', statusAt}`. |
| **Performance** | `meta/contentReview` plus the test-month countdown from `meta/contentScan.testMonth` (falls back to 3 Nov – 3 Dec 2026). Shows last week's top 3 / bottom 3, the format leaderboard, results by hook style and by angle, and the core-format recommendation when present. | **Approve these 5** merges `meta/contentScan.coreFormats = [...]` and `coreFormatsApprovedAt`. The button disappears once the approved list equals the recommendation. |
| **Scanner** | `content_creators` (handle, followers, median reel views, added by, last scanned; `addedReason` shown under the handle when present) and the last run from `meta/contentScan` (`ok`, `briefsSaved`, `accountsAdded`, `note`, run time). Static schedule line: "Scanner Mon/Wed/Fri 4:47am · Review + batch Sun 4:13pm". | none |

`meta/contentBrain` (the rules text) is loaded into state but never rendered.

### Post sheet (tap any card on the Library, calendar or This week board)
Video preview (`video.previewUrl`, poster `video.thumbnailUrl`), status stepper (main states) and side state, timeline (filmed → rendered → approved → scheduled → posted, moved/edited by you), schedule block (day picker + time dropdown, post IDs and permalinks, trial times, Approve / Pull from schedule), feedback thread + box (until posted), caption (count / 2,200), LinkedIn, sound, hooks (marked **filmed** and **trial · time**), beats, ending, slides, format/funnel/angle/hook style/location/effort, platforms (only before scheduling), source idea (link + "Open in Idea Bank"), footage folder, results (24 h / 7 d). Each section has **Edit** for the admin until the post has gone out: Save calls `content-update` with `{id, fields}`, applies the returned `saved` fields at once and shows "Saved" or the function's error; `scriptChangedAfterEdit` shows the amber "The video was cut from the old script." note with a Re-edit button. Locked posts (posted, or posting in under 5 minutes) show the time as text.

### Statuses
Main: `to_film → filmed → editing → edited → awaiting_approval → approved → scheduled → posted` (the stepper). Side states: `changes_requested` (purple), `needs_jordan` and `error` (red), `skipped`, `cancelled` ("Pulled"). `posting.status` may also be `error`; the card then shows an extra red Error chip.

## Tables (Supabase project `hucqdrekawzsrbbkczgj`; every table is `id text PK, data jsonb, created_at, updated_at`)

**`content_ideas`** — one brief per Instagram post, `id` = shortcode.
`shortcode, url, creator, type (reel|carousel), views, likes, comments, shares, creatorMedian, multiple, likeRate, format (F1…F17 / C1…C7), funnel (TOF|MOF|BOF), effort, whyItWorked, jordanVersion, hooks[3], ending, officemaxxing, inferredSaveable, status (new|planned|filmed|skipped), plannedFor, foundAt` — plus, written by the page: `pinned, pinnedAt, statusAt`.

**`content_queue`** — one row per planned slot, `id` = `<weekStart>-<day>-<hi|lo|car>` (off-plan videos: `<weekStart>-<day>-adhoc-<slug>`).
`weekStart (YYYY-MM-DD, Monday), date, day (mon…sun), slot (high|low|carousel), format, funnel, angle, hookStyle, effort, location, sourceIdea (idea shortcode), title, hooks[5], body[], ending, caption, linkedin, slides[], status (see Statuses), postedShortcode, metrics{views,likes,comments,saves,shares,follows, at24h{…}, at7d{…}}` — plus, written by the page: `statusAt, approval{approvedAt, by}, feedback[{id, at, part, text, resolved, resolvedAt, reply}], reEditRequested, editedByJordanAt, scriptChangedAfterEdit`.
Written by the Mac Mini pipeline (`tasteform-video/scripts/autopost`): `footage{folder, files[], hooksFilmed[{hook,start,end}], transcript[], filmedAt, matchedBy}`, `video{file, variants[{file,hook,uploadId}], uploadId, previewUrl, thumbnailUrl, durationS, width, height, renderedAt, clearAllowed}`, `sound{id (Instagram audio id), bankId, title, musicSoundVolume, videoOriginalSoundVolume, soundSwap}`, `posting{status (ready_to_schedule|scheduled|posted|error|cancelled), provider, postId, postIds{PLATFORM:id}, uploadId(s), scheduledFor, scheduledAt, scheduleSource, plannedFor, movedAt, platforms[], trials[{postId, scheduledFor, hook}], permalinks{instagram,…}, postedAt, cancelRequested, error}`, `needsJordan{reason, at, step, fixedAt}`.
The board and calendar place a slot by `posting.scheduledFor` / `plannedFor`, else by `date`; a slot with no time sits in the calendar's "No time yet" row.

**`content_sounds`** — the sound bank, `id` = slug. `title, artist, igAudioId, igAudioTitle, formats[], apiAvailable, vibe, evidence[]`; rows whose id starts with `_` are rules (`_rule-voice-led`). The sheet's sound editor lists every row with an `igAudioId`.

**`content_creators`** — the watchlist, `id` = handle.
`handle, followers, medianReelViews, role (watchlist|baseline), addedBy, addedReason, lastScannedAt`.

**`meta` rows**
- `contentScan`: `ok, lastRunAt (or ranAt / lastScanAt), briefsSaved, accountsAdded, note, status, testMonth{start,end}`, and after approval `coreFormats[], coreFormatsApprovedAt`.
- `contentReview` (written by the Sunday review; the page reads these shapes): `weekStart, generatedAt, top3[], bottom3[]` (items: `title, format, funnel, hookStyle, shortcode|url, views, likes, comments, saves, shares, follows, dms, why`), `formats[]` (`format, n, medianViews, saves, shares, follows …`), `byHookStyle` and `byAngle` (arrays with `hookStyle` / `angle`, or objects keyed by name), `coreFormatRecommendation[]` (`format` + numbers), optional `coreFormatReason`. Any numeric field in the list above becomes a column; missing ones show `–`.
- `contentBatch`: written by the Sunday batch (`weekStart, generatedAt, slotsWritten, ideasUsed, note`); loaded, not rendered yet.
- `posting`: `autoPost, autoPostChangedAt, provider, teamId, connected[], missing[], slotTimes{high, low, carousel, trialSpacingMin}`.
- `autopost`: written by every pipeline run: `lastRunAt, ok, footageFound, matched, ignored, edited, scheduled, posted, needsJordan, errors[], note, videoRoot, learnings[{at, rule, fromRowId}], alerts[]`.
- `contentBrain`: rules text, never rendered.

RLS: the three content tables give `admin` full access and any signed-in user read; `meta` is writable by any signed-in user at the database level, so the page gates the core-format approval to admins itself.

## Functions

- `content-reschedule` (deployed): `{id, postDate}` → moves the bundle.social post first when scheduled, then merges `date, day, weekStart, posting.scheduledFor|plannedFor, posting.movedAt`. Refuses posted posts and anything under 5 minutes away.
- `content-update` (deployed): `{id, fields}` → saves script fields, pushes caption / sound / title to the live scheduled post, sets `editedByJordanAt` and, when hooks/beats/ending/slides change after the cut, `scriptChangedAfterEdit`.
- `content-pipeline` (source in `supabase/functions/content-pipeline/index.ts`, **deploy pending**): the Mac Mini pipeline's data door (merge / get / select on the content tables), authenticated with the bundle.social key via `bundle_api_key()`.

## Tests

`tests/ui.test.js` drives the `content` tab like every other tab (1280 px and 390 px, light and dark, admin and limited): zero console errors, no `NaN`/`undefined`, no horizontal scroll, 44 px touch targets, and the empty-fixture case. Fixture files for `content_ideas`, `content_queue` and `content_creators` go in the fixture folder you pass on the command line.
