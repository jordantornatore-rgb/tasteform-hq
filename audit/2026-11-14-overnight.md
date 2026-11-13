# HQ overnight audit · 14 Nov 2026

Everything below is live (HQ 3.9.4). No client names in this file.

## 1. Done
- **Home rebuilt around the business made simple:** 1 Seen → 2 Leads → 3 Cost per client → 4 Staying. One line under the cards: LTV ÷ CAC and cash collected.
- **"Leads" means the same thing everywhere:** applications plus ad form leads, on Home, the Scorecard and the Leads page.
- **Plan targets on the cards:** leads (15 a month), cost per client ($250 max), churn (10% a month max).
- **Churn % added** to Delivery and Home. The plan is built on churn, but HQ wasn't showing it.
- **Real Stripe retention on Delivery:** how long past clients actually stayed and what they paid, to check the working numbers against.
- **Do today now lists the data jobs** that leave numbers blank: calls to mark in GHL, new clients to move to Closed.
- **Sales says what Stripe sees:** "Sales closed" shows Stripe's new paying clients when GHL has none. CAC by funnel shows ad spend whose campaign name has no funnel tag.
- **Daily brief:** the old "$10K by 31 Dec" goal (estimates of $450 a client, 40% show, 70% close) contradicted the Master Plan. It now shows the plan card instead.
- **Stale DM numbers hidden:** the DM scan is 18 days old, so its counters (31 / 238 / 211) and to-dos are off while it's paused.
- **Fixed the night before (13 Nov):**
  - Delivery's 1.4-week average stay (wrong).
  - 14 "joined" (wrong).
  - 14 "failed payments" (wrong; now matches Revenue's overdue count).
  - A cache bug that blanked Delivery.

## 2. Numbers now (last 30 days)
| | Number | Source | Trust |
|---|---|---|---|
| Seen | 758k views · +149 followers since 4 Nov | Instagram scan | OK |
| Leads | 6 (plan: 15 a month) · 71 form views → 6 applied | Typeform + apply page + GHL | OK |
| Cost per client | $1,074 (target $250) | Meta, both accounts, since 1 Jan: $5,370 ÷ 5 | OK |
| Stay | 4.2 months (working). Stripe past clients: 4.1 avg, 3.2 median | Stripe, 23 past clients | OK |
| LTV | $2,275 working. **Stripe says $1,630** actually paid per past client | Stripe | ⚠ see Q1 |
| LTV ÷ CAC | 2.1× (1.5× on the Stripe LTV) | | |
| Churn | 19% (3 left; plan 10% max) | 1FIT daily check | ⚠ my 1FIT check found 4 since 16 Oct |
| Cash collected | $4,883 | Stripe | OK |

**Still blank or untrusted:**
- Sales closed, close rate and show rate: GHL isn't marked.
- Joined: no real 1FIT start dates.
- Monthly recurring $3,924: Stripe subscriptions only; most clients pay through payment links.

## 3. Do first thing this morning
1. In GHL, mark the 7 recent sales calls Showed or No-show.
2. In GHL, move the 3 new paying clients to Closed / Won.
3. Open HQ Home and press Cmd+Shift+R once.
4. Answer the questions below (A/B is fine).
5. Next time ads run, put "fasttrack" or "compounding" in each campaign name.
6. In the Lead list deployment chat, confirm the admin-only migration (20261112_time_meta_admin_only) was applied.

## 4. Questions
1. **LTV:** use the real Stripe $1,630 (A) or the working $2,275 at $125 a week (B)?
2. **George P:** still counted as an active client. Keep (A) or take out of the count (B)?
3. **DMs, Follow-ups, Magnets:** fix the DM scan (A) or hide those pages (B)?
4. **Daily brief:** keep (A) or fold into Home and drop it (B)?
5. **Monthly recurring:** swap for "cash collected, last 30 days" (A) or keep Stripe subscriptions only (B)?

## 5. Removed or moved (all reversible; no data deleted)
- **Home cards** Traffic / Leads / Sales / Delivery became Seen / Leads / Cost per client / Staying. Cash collected moved to the line under the cards.
- **Daily brief goal strip** ($10K goal and its estimate form) replaced by the plan card. The saved goal is untouched.
- **Sidebar DM / Follow-ups / Magnets counters** hidden while the DM scan is paused.
- **Daily brief DM to-dos** (replies, follow-ups, magnets) hidden while the DM scan is paused.
- **Delivery:** "Failed payments" renamed "Overdue payments", with Revenue's count.

*Tests:* all suites pass except core (3) and ui (32). Both were failing before tonight; checked on the pre-audit commit.
