-- Time tab: meta rows time:<date>, timeNow, timeCfg are Jordan's own day, so admin only (same rule as challenge*).
drop policy if exists select_authenticated on public.meta;
drop policy if exists insert_authenticated on public.meta;
drop policy if exists update_authenticated on public.meta;
create policy select_authenticated on public.meta for select to authenticated using ((id not like 'challenge%' and id not like 'time%') or public.is_admin());
create policy insert_authenticated on public.meta for insert to authenticated with check ((id not like 'challenge%' and id not like 'time%') or public.is_admin());
create policy update_authenticated on public.meta for update to authenticated using ((id not like 'challenge%' and id not like 'time%') or public.is_admin()) with check ((id not like 'challenge%' and id not like 'time%') or public.is_admin());
