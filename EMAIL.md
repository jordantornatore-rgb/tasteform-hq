# Email tab

Admin only (sidebar → Growth → Email, phone → More → Email, hash `#email`). Shows the GHL email sequences sent to the recipe lead-magnet list: what is about to go out, what has gone out, and how each email performed. Every number is a count of real `email_events` rows; rates are `–` until something is sent.

## Views
- **Up next** — each `email_steps` row in order: subject, body (`{{contact.first_name}}` shown green, unfilled `[brackets]` yellow with a "Needs filling" chip), Draft/Live, and how many contacts are due it now / later. A contact moves to the step after the last one GHL reported sent to them, `delayDays` later; anyone who replied, bounced or unsubscribed drops out.
- **Sent** — every send GHL reported, newest first, with opened / replied and the contact's `group: value` tags.
- **Performance** — per email: sent, reply %, replied, open %, opened, unsubs. Then the same split by tag group: recipe downloaded, job, country. Opens and replies only count people who were sent that email. Apple Mail inflates opens; judge subject lines on reply rate.

## Data
Tables (Supabase `hucqdrekawzsrbbkczgj`, `id text PK, data jsonb`, RLS admin-only for every operation):
- `email_steps` — `order, sequence, name, delayDays, audience, subject, body, status (draft|live), note`.
- `email_events` — id `<contactId>:<step>:<event>`; `contactId, step, event (enrolled|sent|opened|clicked|replied|bounced|unsubscribed), at, lastAt, count, tags[], firstName, country, workflow`.
- `meta/emailSync` — `connected, lastEventAt, lastEvent, fromAddress`.

Logic lives in `HQ.emailStats(steps, events, now)` in `hq-core.js` (unit-tested in `tests/core.test.js`).

## Webhook
Edge function `ghl-email-event` (no JWT; does its own check). GHL workflow **Webhook** actions POST to

`https://hucqdrekawzsrbbkczgj.supabase.co/functions/v1/ghl-email-event?key=<GHL_WEBHOOK_KEY>`

with Custom Data `event` and `step` (an `email_steps` id). Place one after the workflow trigger (`event=enrolled`, `step=recipe-1`), one after each email (`event=sent`), and use separate workflows on **Email Events → Opened** and **Customer Replied** for `opened` / `replied`. The function refuses every call until the `GHL_WEBHOOK_KEY` function secret is set (Supabase → Edge Functions → Secrets).

## Tags
Contacts are tagged `recipe: <name>`, `country: <code>`, `job: corporate`. Only tags in that `group: value` form are used for the splits.
