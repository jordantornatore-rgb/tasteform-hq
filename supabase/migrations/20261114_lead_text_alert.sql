-- Instant text to Jordan, with the lead's details, when someone submits the apply page (14 Nov 2026; Jordan:
-- "the instant notification with their details is important"). Runs beside app_sessions_to_ghl and never blocks
-- it: pg_net posts to the hq-notify edge function in the background. Test entries (utm_content ~ test) are skipped.
create or replace function public.app_sessions_notify_lead() returns trigger
language plpgsql security definer set search_path to 'public', 'vault', 'net' as $$
declare k text; src text; c jsonb; a jsonb; msg text;
begin
  if coalesce((new.data->>'submitted')::boolean,false) and not coalesce((old.data->>'submitted')::boolean,false)
     and coalesce(new.data->'utm'->>'utm_content','') not ilike '%test%' then
    select decrypted_secret into k from vault.decrypted_secrets where name = 'bundle_social_api_key' limit 1;
    c := coalesce(new.data->'contact','{}'::jsonb); a := coalesce(new.data->'answers','{}'::jsonb);
    src := coalesce(nullif(new.data->'utm'->>'utm_medium',''), nullif(new.data->'utm'->>'utm_source',''), 'link in bio');
    msg := 'HQ NEW LEAD: ' || coalesce(c->>'firstName','(no name)')
      || ' · ' || coalesce(c->>'phoneE164', c->>'phone', 'no number')
      || coalesce(' · ' || (c->>'email'), '')
      || coalesce(' · age ' || (a->>'age'), '')
      || coalesce(' · goal: ' || left(a->>'goal', 120), '')
      || coalesce(' · tried: ' || left(a->>'tried', 120), '')
      || ' · via ' || src || '. Call within the hour.';
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
revoke all on function public.app_sessions_notify_lead() from public, anon, authenticated;
drop trigger if exists app_sessions_notify_lead on public.app_sessions;
create trigger app_sessions_notify_lead after update on public.app_sessions for each row execute function public.app_sessions_notify_lead();
