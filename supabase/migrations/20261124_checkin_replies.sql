-- Check-in video replies (24 Nov 2026). Jordan records a Loom reply to a client's check-in, HQ makes a private
-- link (tasteform-hq/r.html?k=<token>), the client watches it there and can optionally rate it, ask a question,
-- and say they want a 1:1 / extra support (then the booking calendar shows). The table is admin only; the public
-- page only ever touches one row, by its unguessable token, through the two security-definer functions below.
create table if not exists public.checkin_replies (
  id text primary key,                       -- random 12-char token used in the link
  client_name text not null,
  member_id text,                            -- challenge_members id (1FIT roster), if picked from the list
  loom_url text not null,
  note text,
  created_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  views int not null default 0,
  rating int check (rating between 1 and 5),
  rated_at timestamptz,
  question text,
  question_at timestamptz,
  wants_support boolean,
  support_at timestamptz,
  booked_click_at timestamptz
);
alter table public.checkin_replies enable row level security;
drop policy if exists checkin_replies_admin on public.checkin_replies;
create policy checkin_replies_admin on public.checkin_replies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Public read of one reply (first name only) + view count.
create or replace function public.checkin_open(k text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare r public.checkin_replies;
begin
  update public.checkin_replies
     set views = views + 1, last_viewed_at = now(), first_viewed_at = coalesce(first_viewed_at, now())
   where id = k returning * into r;
  if r.id is null then return null; end if;
  return jsonb_build_object('name', split_part(r.client_name, ' ', 1), 'loom', r.loom_url, 'note', r.note,
    'rating', r.rating, 'question', r.question, 'wants_support', r.wants_support, 'created_at', r.created_at);
end $$;

-- Public answer. Each field is optional; null leaves it as it was.
create or replace function public.checkin_answer(k text, p_rating int default null, p_question text default null,
  p_wants_support boolean default null, p_booked boolean default null) returns boolean
language plpgsql security definer set search_path to 'public' as $$
begin
  update public.checkin_replies set
    rating = coalesce(case when p_rating between 1 and 5 then p_rating end, rating),
    rated_at = case when p_rating between 1 and 5 then now() else rated_at end,
    question = coalesce(nullif(left(trim(p_question), 2000), ''), question),
    question_at = case when nullif(trim(p_question), '') is not null then now() else question_at end,
    wants_support = coalesce(p_wants_support, wants_support),
    support_at = case when p_wants_support is not null then now() else support_at end,
    booked_click_at = case when p_booked then now() else booked_click_at end
  where id = k;
  return found;
end $$;
revoke all on function public.checkin_open(text) from public;
revoke all on function public.checkin_answer(text, int, text, boolean, boolean) from public;
grant execute on function public.checkin_open(text) to anon, authenticated;
grant execute on function public.checkin_answer(text, int, text, boolean, boolean) to anon, authenticated;

-- Text Jordan (hq-notify) when a client asks a question or says they want a 1:1 / extra support.
create or replace function public.checkin_replies_notify() returns trigger
language plpgsql security definer set search_path to 'public', 'vault', 'net' as $$
declare k text; msg text;
begin
  if new.question is distinct from old.question and nullif(new.question,'') is not null then
    msg := 'HQ CHECK-IN: ' || new.client_name || ' asked: ' || left(new.question, 400);
  elsif coalesce(new.wants_support,false) and not coalesce(old.wants_support,false) then
    msg := 'HQ CHECK-IN: ' || new.client_name || ' wants a 1:1 / extra support after your Loom. Calendar link is on their page.';
  end if;
  if msg is not null then
    select decrypted_secret into k from vault.decrypted_secrets where name = 'bundle_social_api_key' limit 1;
    if k is not null then
      perform net.http_post(
        url := 'https://hucqdrekawzsrbbkczgj.supabase.co/functions/v1/hq-notify',
        headers := jsonb_build_object('Content-Type','application/json','x-pipeline-key',k),
        body := jsonb_build_object('kind','sms','text',left(msg, 600)));
    end if;
  end if;
  return new;
exception when others then return new;
end $$;
revoke all on function public.checkin_replies_notify() from public, anon, authenticated;
drop trigger if exists checkin_replies_notify on public.checkin_replies;
create trigger checkin_replies_notify after update on public.checkin_replies
  for each row execute function public.checkin_replies_notify();
