-- Check-in replies v2 (24 Nov 2026): Claude's weekend run writes DRAFT rows (status 'draft', loom_url null) with
-- Loom talking points from the client's 1FIT check-in. Jordan pastes the Loom in HQ; the trigger below calls the
-- checkin-send edge function, which emails (and SMSes, when GHL has a mobile) the client their reply page link.
-- Applied via the Supabase MCP (same SQL as the migration named checkin_replies_drafts_autosend).
alter table public.checkin_replies alter column loom_url drop not null;
alter table public.checkin_replies add column if not exists status text not null default 'sent';
alter table public.checkin_replies add column if not exists points text;
alter table public.checkin_replies add column if not exists checkin jsonb;
alter table public.checkin_replies add column if not exists checkin_key text;
alter table public.checkin_replies add column if not exists client_email text;
alter table public.checkin_replies add column if not exists sent_at timestamptz;
alter table public.checkin_replies add column if not exists send_result jsonb;
create unique index if not exists checkin_replies_checkin_key on public.checkin_replies(checkin_key) where checkin_key is not null;
-- checkin_open now ignores drafts (loom_url is null); checkin_replies_send trigger: after insert or update of loom_url.
