-- Client database (HQ "Clients" tab). Admin only. Filled nightly by the "Client database nightly" scheduled task via hq_merge.
--   client_profiles  id = challenge_members.id   data: profile, goal, status, flags, brief, loom talking points, gym/scale summaries
--   client_metrics   id = <member>|<date>|<kind> data: {member_id, date, kind: weight|steps|session|checkin|calories|protein, value, unit, detail}
--   client_timeline  id = <member>|<source>|<key> data: {member_id, at, source: whatsapp|checkin|loom|fathom|1fit|note, title, body, private}
create table if not exists public.client_profiles (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.client_metrics  (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.client_timeline (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create index if not exists client_metrics_member on public.client_metrics ((data->>'member_id'), (data->>'date'));
create index if not exists client_timeline_member on public.client_timeline ((data->>'member_id'), (data->>'at'));

do $$ declare t text; begin
  foreach t in array array['client_profiles','client_metrics','client_timeline'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_admin())', t||'_admin_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (is_admin())', t||'_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (is_admin()) with check (is_admin())', t||'_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (is_admin())', t||'_admin_delete', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create or replace function public.hq_merge(tbl text, rows jsonb)
 returns integer language plpgsql set search_path to 'public'
as $function$
declare n integer := 0; r jsonb;
begin
  if tbl not in ('dm_threads','dm_daily','script_reviews','contacts','posts','ig_posts','ig_stories','ig_account_daily','meta','tf_responses','content_ideas','content_creators','content_queue','content_sounds','challenge_members','challenge_events','client_profiles','client_metrics','client_timeline') then
    raise exception 'hq_merge: table % is not allowed', tbl;
  end if;
  if jsonb_typeof(rows) <> 'array' then raise exception 'hq_merge: rows must be a JSON array of {id, data}'; end if;
  for r in select * from jsonb_array_elements(rows) loop
    if r->>'id' is null or jsonb_typeof(r->'data') <> 'object' then raise exception 'hq_merge: each row needs id and object data'; end if;
    execute format('insert into public.%I (id, data, updated_at) values ($1, $2, now()) on conflict (id) do update set data = %I.data || excluded.data, updated_at = now()', tbl, tbl)
      using (r->>'id'), (r->'data');
    n := n + 1;
  end loop;
  return n;
end;
$function$;
