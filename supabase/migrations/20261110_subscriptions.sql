-- Subscriptions log (HQ Business > Subscriptions): what TasteForm pays for, what it costs, when it renews.
-- Same shape as the other HQ tables (id, data jsonb, updated_at) and admin only, like stripe_* and challenge_*.
create table if not exists public.subscriptions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_admin_select on public.subscriptions;
drop policy if exists subscriptions_admin_insert on public.subscriptions;
drop policy if exists subscriptions_admin_update on public.subscriptions;
drop policy if exists subscriptions_admin_delete on public.subscriptions;
create policy subscriptions_admin_select on public.subscriptions for select to authenticated using (public.is_admin());
create policy subscriptions_admin_insert on public.subscriptions for insert to authenticated with check (public.is_admin());
create policy subscriptions_admin_update on public.subscriptions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy subscriptions_admin_delete on public.subscriptions for delete to authenticated using (public.is_admin());
revoke all on public.subscriptions from anon;
grant select, insert, update, delete on public.subscriptions to authenticated;
