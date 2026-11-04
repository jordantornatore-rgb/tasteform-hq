-- Analytics tab: one row per Sydney day of account-level Instagram numbers, written by the content scan.
-- id = 'YYYY-MM-DD'; data = {date, followers, p7:{reached,views,interactions,follows,unfollows}, p30:{...}, p90:{...}, scannedAt}
create table if not exists public.ig_account_daily (id text primary key, data jsonb not null default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
alter table public.ig_account_daily enable row level security;
create policy "admin full access" on public.ig_account_daily for all using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
create policy "authenticated read" on public.ig_account_daily for select using (auth.uid() is not null);
-- hq_merge allowlist now includes 'ig_account_daily' (function body as applied on 4 Nov 2026).
