-- Delivery numbers for the HQ Delivery page: counts only, no names, so any signed-in user can see them
-- while the challenge tables themselves stay admin only.
create or replace function public.hq_delivery_counts(from_day date, to_day date)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  with m as (
    select (data->>'active')::boolean as active,
           case when data->>'joinedAt' ~ '^\d{4}-' then (data->>'joinedAt')::timestamptz end as joined,
           case when data->>'leftAt'   ~ '^\d{4}-' then (data->>'leftAt')::timestamptz end as left_at
    from challenge_members
  )
  select json_build_object(
    'active',      (select count(*) from m where active is true),
    'joined',      (select count(*) from m where (joined at time zone 'Australia/Sydney')::date between from_day and to_day),
    'left',        (select count(*) from m where (left_at at time zone 'Australia/Sydney')::date between from_day and to_day),
    'avgWeeks',    (select round(avg(extract(epoch from (coalesce(left_at, now()) - joined)) / 604800)::numeric, 1) from m where joined is not null),
    'withJoinDate',(select count(*) from m where joined is not null),
    'checkinsOnTime', (select count(*) from challenge_events
                        where data->>'type' = 'checkin_on_time' and data->>'status' = 'confirmed'
                          and data->>'date' ~ '^\d{4}-\d\d-\d\d$' and (data->>'date')::date between from_day and to_day)
  );
$$;
revoke all on function public.hq_delivery_counts(date, date) from public, anon;
grant execute on function public.hq_delivery_counts(date, date) to authenticated;
