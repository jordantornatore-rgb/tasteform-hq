# Content Engine tab

The **Content Engine** tab (sidebar → Growth, phone → More → Content Engine, hash `#content`) is the front end for the three-times-weekly creator **Scanner**, the Sunday **batch** that writes the weekly plan, and the Sunday **review**. Everyone signed in can read it; only the `admin` profile can change anything. Every write is a merge into the row's `data` (the `db.doc().update()` path in `index.html`), so a scan or batch never loses fields the page didn't touch.

All dates are Sydney days (`HQ.sydNow`, `HQ.weekStart`, `HQ.fmtDay` from `hq-core.js`). Numbers are exact or `–` with the reason next to them; nothing is estimated.

## Views (segmented control at the top)

| View | Reads | Writes (admin only) |
| --- | --- | --- |
| **This week** | `content_queue` rows whose `date` falls in the Mon–Sun week (or whose `weekStart` matches when `date` is missing). Prev / Next moves a week. Progress bars count filmed / approved / posted out of the 18 slots the plan aims for (skipped slots are excluded). "Filming list" groups unfilmed slots by `location` (desk, car, mirror, kitchen, gym, outside, then anything else). Tap a card for the script sheet: 5 hooks, beats (`body[]`), ending, caption, LinkedIn version, slides, each with Copy. | Status stepper `to_film → filmed → edited → approved → scheduled → posted` and "Skip this slot" merge **only** `status` and `statusAt` (ISO). Non-admins see the stepper disabled. |
| **Idea Bank** | `content_ideas`, newest `foundAt` first. Filters: status, funnel, format, type (reel/carousel), Officemaxxing. Stat line is `multiple`× the creator's median when the Scanner stored it, otherwise views, otherwise likes / shares, otherwise `–`. Link goes to `url` or `instagram.com/p/<shortcode>/`. Empty state: "Scanner runs Mon/Wed/Fri. First briefs land after the next run." | **Skip** → `{status:'skipped', statusAt}`. **Use next week** → `{status:'new', pinned:true, pinnedAt}` (the Sunday batch takes pinned ideas first). Unpin → `{pinned:false}`. Restore → `{status:'new', statusAt}`. |
| **Performance** | `meta/contentReview` plus the test-month countdown from `meta/contentScan.testMonth` (falls back to 3 Nov – 3 Dec 2026). Shows last week's top 3 / bottom 3, the format leaderboard, results by hook style and by angle, and the core-format recommendation when present. | **Approve these 5** merges `meta/contentScan.coreFormats = [...]` and `coreFormatsApprovedAt`. The button disappears once the approved list equals the recommendation. |
| **Scanner** | `content_creators` (handle, followers, median reel views, added by, last scanned; `addedReason` shown under the handle when present) and the last run from `meta/contentScan` (`ok`, `briefsSaved`, `accountsAdded`, `note`, run time). Static schedule line: "Scanner Mon/Wed/Fri 4:47am · Review + batch Sun 4:13pm". | none |

`meta/contentBrain` (the rules text) is loaded into state but never rendered.

## Tables (Supabase project `hucqdrekawzsrbbkczgj`; every table is `id text PK, data jsonb, created_at, updated_at`)

**`content_ideas`** — one brief per Instagram post, `id` = shortcode.
`shortcode, url, creator, type (reel|carousel), views, likes, comments, shares, creatorMedian, multiple, likeRate, format (F1…F17 / C1…C7), funnel (TOF|MOF|BOF), effort, whyItWorked, jordanVersion, hooks[3], ending, officemaxxing, inferredSaveable, status (new|planned|filmed|skipped), plannedFor, foundAt` — plus, written by the page: `pinned, pinnedAt, statusAt`.

**`content_queue`** — one row per planned slot, `id` = `<weekStart>-<day>-<hi|lo|car>`.
`weekStart (YYYY-MM-DD, Monday), date, day (mon…sun), slot (high|low|carousel), format, funnel, angle, hookStyle, effort, location, sourceIdea (idea shortcode), title, hooks[5], body[], ending, caption, linkedin, slides[], status (to_film|filmed|edited|approved|scheduled|posted|skipped), postedShortcode, metrics{views,likes,comments,saves,shares,follows}` — plus, written by the page: `statusAt`.
The board places a slot by `date`; if `date` is missing it uses `weekStart` + `day`.

**`content_creators`** — the watchlist, `id` = handle.
`handle, followers, medianReelViews, role (watchlist|baseline), addedBy, addedReason, lastScannedAt`.

**`meta` rows**
- `contentScan`: `ok, lastRunAt (or ranAt / lastScanAt), briefsSaved, accountsAdded, note, status, testMonth{start,end}`, and after approval `coreFormats[], coreFormatsApprovedAt`.
- `contentReview` (written by the Sunday review; the page reads these shapes): `weekStart, generatedAt, top3[], bottom3[]` (items: `title, format, funnel, hookStyle, shortcode|url, views, likes, comments, saves, shares, follows, dms, why`), `formats[]` (`format, n, medianViews, saves, shares, follows …`), `byHookStyle` and `byAngle` (arrays with `hookStyle` / `angle`, or objects keyed by name), `coreFormatRecommendation[]` (`format` + numbers), optional `coreFormatReason`. Any numeric field in the list above becomes a column; missing ones show `–`.
- `contentBatch`: loaded, not rendered yet.
- `contentBrain`: rules text, never rendered.

RLS: the three content tables give `admin` full access and any signed-in user read; `meta` is writable by any signed-in user at the database level, so the page gates the core-format approval to admins itself.

## Tests

`tests/ui.test.js` drives the `content` tab like every other tab (1280 px and 390 px, light and dark, admin and limited): zero console errors, no `NaN`/`undefined`, no horizontal scroll, 44 px touch targets, and the empty-fixture case. Fixture files for `content_ideas`, `content_queue` and `content_creators` go in the fixture folder you pass on the command line.
