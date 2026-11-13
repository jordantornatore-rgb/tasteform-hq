-- Lead list: one row per GoHighLevel contact, written hourly by the ghl-leads edge function (service role).
-- Holds names, emails and numbers, so only admins can read it. Nobody writes it from the app.
create table if not exists public.hq_leads (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hq_leads_synced_at on public.hq_leads (synced_at);
alter table public.hq_leads enable row level security;
drop policy if exists hq_leads_admin_select on public.hq_leads;
create policy hq_leads_admin_select on public.hq_leads for select to authenticated using (public.is_admin());
revoke all on public.hq_leads from anon;
