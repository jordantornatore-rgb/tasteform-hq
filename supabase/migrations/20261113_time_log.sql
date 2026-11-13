-- time_log: write time blocks the same way the HQ Time page does, so Claude can log what Jordan tells it.
-- Storage (meta, admin only): time:<Sydney date> {entries:[{id,k,s,e,en,n,c,cn,src}]} with s/e epoch ms; timeNow {k,s,n,c,cn}.
-- Rules (same as the page): blocks never overlap (a new block replaces whatever it covers, splitting longer ones),
-- blocks split at Sydney midnight, pieces under 1 minute are dropped. If the live timer started before the block,
-- the part before is saved and the timer carries on from the block's end.
-- p_entries: [{"k":"cireview","s":"2026-11-13T14:00:00+11:00","e":"2026-11-13T14:30:00+11:00","n":"detail","c":"dom-socaciu","cn":"Dom Socaciu"}]
-- (s/e may also be epoch ms numbers). Returns {"added":n,"days":[...]}.
create or replace function public.time_log(p_entries jsonb, p_src text default 'claude')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tz constant text := 'Australia/Sydney';
  it jsonb; s_ms bigint; e_ms bigint; k text;
  d date; d0 bigint; d1 bigint; a bigint; b bigint;
  cur jsonb; ents jsonb; x jsonb; out_ents jsonb; xs bigint; xe bigint;
  run jsonb; rs bigint;
  added int := 0; days text[] := '{}';
  piece jsonb;
begin
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'p_entries must be a JSON array'; end if;
  for it in select * from jsonb_array_elements(p_entries) loop
    k := it->>'k';
    if k is null then raise exception 'every entry needs k (the step key)'; end if;
    s_ms := case when jsonb_typeof(it->'s') = 'number' then (it->>'s')::bigint else (extract(epoch from (it->>'s')::timestamptz) * 1000)::bigint end;
    e_ms := case when jsonb_typeof(it->'e') = 'number' then (it->>'e')::bigint else (extract(epoch from (it->>'e')::timestamptz) * 1000)::bigint end;
    if e_ms <= s_ms then raise exception 'entry % ends before it starts', it; end if;
    if e_ms > (extract(epoch from now()) * 1000)::bigint + 60000 then raise exception 'entry % runs into the future', it; end if;

    -- the live timer: keep what it had before this block, restart it after
    select data into run from meta where id = 'timeNow';
    if run is not null and run->>'k' is not null and (run->>'s')::bigint < e_ms then
      rs := (run->>'s')::bigint;
      if rs < s_ms then
        perform public.time_log(jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('k', run->>'k', 's', rs, 'e', s_ms, 'n', run->>'n', 'c', run->>'c', 'cn', run->>'cn'))), 'timer');
      end if;
      update meta set data = jsonb_set(run, '{s}', to_jsonb(e_ms)), updated_at = now() where id = 'timeNow';
    end if;

    -- every Sydney day the block touches
    d := (to_timestamp(s_ms / 1000.0) at time zone tz)::date;
    loop
      d0 := (extract(epoch from (d::timestamp at time zone tz)) * 1000)::bigint;
      d1 := (extract(epoch from ((d + 1)::timestamp at time zone tz)) * 1000)::bigint;
      exit when d0 >= e_ms;
      a := greatest(s_ms, d0); b := least(e_ms, d1);
      select data into cur from meta where id = 'time:' || d::text;
      ents := coalesce(cur->'entries', '[]'::jsonb);
      out_ents := '[]'::jsonb;
      for x in select * from jsonb_array_elements(ents) loop
        xs := (x->>'s')::bigint; xe := (x->>'e')::bigint;
        if xe <= a or xs >= b then
          out_ents := out_ents || jsonb_build_array(x);
        else
          if a - xs >= 60000 then out_ents := out_ents || jsonb_build_array(x || jsonb_build_object('e', a)); end if;
          if xe - b >= 60000 then out_ents := out_ents || jsonb_build_array(x || jsonb_build_object('id', (x->>'id') || 'b', 's', b)); end if;
        end if;
      end loop;
      if b - a >= 60000 then
        piece := jsonb_strip_nulls(jsonb_build_object(
          'id', 'c' || to_hex((extract(epoch from clock_timestamp()) * 1000000)::bigint) || substr(md5(random()::text), 1, 4),
          'k', k, 's', a, 'e', b, 'n', nullif(it->>'n', ''), 'c', nullif(it->>'c', ''), 'cn', nullif(it->>'cn', ''),
          'en', case when (it->>'en') in ('1','-1') then (it->>'en')::int else null end, 'src', p_src));
        out_ents := out_ents || jsonb_build_array(piece);
        added := added + 1;
      end if;
      out_ents := coalesce((select jsonb_agg(v order by (v->>'s')::bigint) from jsonb_array_elements(out_ents) v), '[]'::jsonb);
      insert into meta (id, data, updated_at) values ('time:' || d::text, jsonb_build_object('entries', out_ents), now())
        on conflict (id) do update set data = coalesce(meta.data, '{}'::jsonb) || jsonb_build_object('entries', out_ents), updated_at = now();
      if not (d::text = any(days)) then days := days || d::text; end if;
      d := d + 1;
    end loop;
  end loop;
  return jsonb_build_object('added', added, 'days', to_jsonb(days));
end;
$$;
revoke all on function public.time_log(jsonb, text) from public, anon, authenticated;
grant execute on function public.time_log(jsonb, text) to service_role;
