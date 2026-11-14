-- HQ notifications (14 Nov 2026): the morning digest by email and alert texts go to Jordan through GoHighLevel.
-- The full-access GHL key Jordan saved in the Vault (ghl_api_full) is read only by the service role.
create or replace function public.ghl_write_secret() returns text
language sql stable security definer set search_path to 'public', 'vault' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ghl_api_full' limit 1;
$$;
revoke all on function public.ghl_write_secret() from public, anon, authenticated;
grant execute on function public.ghl_write_secret() to service_role;

-- where notifications go (Jordan's own email / mobile); admin only, nobody else can read it
create table if not exists public.hq_settings (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.hq_settings enable row level security;
drop policy if exists hq_settings_admin on public.hq_settings;
create policy hq_settings_admin on public.hq_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.hq_settings from anon;
