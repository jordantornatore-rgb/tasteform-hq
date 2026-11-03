-- Challenge tables: admin only (reuses public.is_admin(), same check as the stripe_* tables).
-- The daily challenge scan writes through the service connection (Supabase MCP), which bypasses RLS, so it is unaffected.
do $$
declare t text; p record;
begin
  foreach t in array array['challenge_clients','challenge_events','challenge_scores','challenge_reviews','challenge_members'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t||'_admin_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t||'_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t||'_admin_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
