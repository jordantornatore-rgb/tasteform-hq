You are running the TasteForm HQ likes scan (v5) for Jordan Tornatore's coaching business (TasteForm, Sydney). Goal: keep his "Warm Leads" board fresh before his morning review by tracking who likes his posts. STRICTLY READ-ONLY on Instagram: never like, follow, comment, message or change anything. Numbers exact or blank, never estimated. Times are ISO 8601 with the Sydney offset (`TZ=Australia/Sydney date -Iseconds`). Hard stop 20 minutes after you start: then go to step 6.

WRITES: only through `select hq_merge('<table>', '<json array of {"id","data"}>'::jsonb);` (Supabase project `hucqdrekawzsrbbkczgj`; load the tool with ToolSearch "select:mcp__Supabase__execute_sql"). It upserts and MERGES; never use update/delete statements. Tables: posts, contacts, meta.

## 1. What is stored
`select id, data->>'postedAt' posted, data->>'partial' partial, data->>'likeTotal' lt, jsonb_array_length(data->'likers') n from posts order by 2 desc;` and `select data from meta where id='scan';`. The like window is the 20 newest stored posts (fewer while history is building).

## 2. Chrome
Load: ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__browser_batch". Open a new tab at https://www.instagram.com/jordantornatore/. If Chrome or the login is unreachable after one retry, go to step 6 with lastAttemptOk false.

## 3. Which posts to read
From the profile grid (newest first), take every post or reel that is NOT yet in `posts` and is at least 24 hours old (younger ones are `postsWaiting`; their likes are still coming in). Also re-read any stored post marked `partial: true`. Stop once you have 20 stored posts' worth of history or 6 reads this run (`postsSkipped` = older unread posts you left for next time).

## 4. Read a post's likers
Open the post, note the date shown (store `postedAt` as that date at 00:00 Sydney with `postedAtExact: false`, or the exact time if shown, `postedAtExact: true`). Click the "others" link in "Liked by X and others" to open the Likes dialog; read the total (`likeTotal`). Collect every account href in the dialog with read_page (filter interactive, ref of the dialog), scroll_to the last link, wait 1 s, read again; repeat until no new hrefs after 3 tries. Append usernames (lowercase, no slashes) to a scratch file per post with a dedupe step. `likersCaptured` = count; `partial` = captured < 90% of likeTotal. Then merge the row: `{"id": "<shortcode>", "data": {"shortcode", "url", "postedAt", "postedAtExact", "likeTotal", "likers": [...], "likersCaptured", "partial", "scannedAt"}}`.

## 5. Tiers (one SQL, then one merge)
Compute from the 20 newest stored posts by postedAt: per username, likeCount = number of those posts they liked. Rules: never change rows with tier `personal` or `close_friends` except their `likeCount`/`lastScanAt`; a username with likeCount ≥ 3 that is not stored (or stored as `inactive`/`super_engaged`) becomes `super_engaged` (`addedAt`/`firstSeenAt` = now for new rows, `source: "scan"`); a stored `super_engaged` whose likeCount drops to 0 becomes `inactive` only once 20 posts are stored; update `likeCount`, `lastScanAt`, `updatedAt` for everyone in the window. Write with hq_merge('contacts', ...) in batches of 50.

## 6. ALWAYS write meta/scan
`select hq_merge('meta', '[{"id":"scan","data":{...}}]'::jsonb);` with `lastAttemptAt`, `lastAttemptOk`, `lastAttemptNote` (one line), `schedule: "daily 3:15am"`, and on success `lastScanAt`, `lastScanCount` (posts read this run), `storedPosts`, `windowPosts` (min(20, storedPosts)), `partialPosts`, `postsSkipped`, `postsWaiting`, `uniqueLikers` (distinct likers across the window).

## 7. Finish
Push notification (PushNotification tool) only if the run failed or new Super Engaged names appeared (list them, one line). End with 3 lines: posts read, new Super Engaged, anything partial. Close the tab you opened.