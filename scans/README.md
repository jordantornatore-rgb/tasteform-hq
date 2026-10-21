# Scan prompts (v5)

These are the instructions the three Instagram scans run on. Each file is the whole prompt; paste it verbatim into the **Instructions** box of the matching routine on claude.ai (Scheduled tasks → the routine → Edit), set the model to **Sonnet**, keep permissions on **Auto** and "Require this computer (2nd's Mac mini)".

| File | Routine on claude.ai | Schedule (Sydney) |
| --- | --- | --- |
| `dm-scan.md` | TasteForm HQ — DM scan (5× daily, Mac Mini) | 6:07, 10:07, 14:07, 18:07, 22:07 (22:07 = 50-min backlog run) |
| `likes-scan.md` | Warm Leads Board — daily Instagram scan (Mac Mini) | 3:15 |
| `content-scan.md` | *(new — create it)* TasteForm HQ — content scan (Mac Mini) | 4:32 daily |

The same prompts are installed as Claude-app scheduled tasks on the Mac mini (`hq-dm-scan`, `hq-likes-scan`, `hq-content-scan`), currently off. Either place works; never run both for the same scan.

Rules every prompt shares: Instagram strictly read-only; writes only through `hq_merge` (merge, never delete); exact or blank; every run ends by writing its `meta` row so the System health panel is honest even after a failure.
