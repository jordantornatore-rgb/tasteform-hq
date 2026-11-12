-- Joined / left per Sydney day for the Friday scorecard: counts only, no names.
create or replace function public.hq_delivery_by_day(from_day date, to_day date)
returns json language sql stable security definer set search_path to 'public' as $$
  with m as (
    select case when data->>'joinedAt' ~ '^\d{4}-' then ((data->>'joinedAt')::timestamptz at time zone 'Australia/Sydney')::date end as j,
           case when data->>'leftAt'   ~ '^\d{4}-' then ((data->>'leftAt')::timestamptz   at time zone 'Australia/Sydney')::date end as l
    from challenge_members
  ), d as (
    select j as day, 1 as joined, 0 as lft from m where j between from_day and to_day
    union all select l, 0, 1 from m where l between from_day and to_day
  )
  select coalesce(json_object_agg(day, json_build_object('joined', joined, 'left', lft)), '{}'::json)
  from (select day, sum(joined) joined, sum(lft) lft from d group by day) x;
$$;
revoke all on function public.hq_delivery_by_day(date, date) from public, anon;
grant execute on function public.hq_delivery_by_day(date, date) to authenticated;
