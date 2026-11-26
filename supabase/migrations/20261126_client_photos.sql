-- Progress photos: private bucket progress-photos + client_photos rows (admin read), narrow upload key for photo-ingest.
create table if not exists public.client_photos (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create index if not exists client_photos_member on public.client_photos ((data->>'member_id'), (data->>'date'));
alter table public.client_photos enable row level security;
drop policy if exists client_photos_admin_select on public.client_photos;
drop policy if exists client_photos_admin_update on public.client_photos;
create policy client_photos_admin_select on public.client_photos for select to authenticated using (is_admin());
create policy client_photos_admin_update on public.client_photos for update to authenticated using (is_admin()) with check (is_admin());
revoke all on public.client_photos from anon;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos','progress-photos', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists progress_photos_admin_read on storage.objects;
create policy progress_photos_admin_read on storage.objects for select to authenticated using (bucket_id='progress-photos' and public.is_admin());
do $$ begin
  if not exists (select 1 from vault.secrets where name='photo_ingest_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24),'hex'), 'photo_ingest_key', 'photo-ingest edge function upload key (narrow)');
  end if;
end $$;
create or replace function public.photo_ingest_key() returns text language sql stable security definer set search_path to 'public','vault'
as $f$ select decrypted_secret from vault.decrypted_secrets where name='photo_ingest_key' limit 1 $f$;
revoke all on function public.photo_ingest_key() from public, anon, authenticated;
-- + hq_merge allow-list gains 'client_photos' (same body as 20261126_client_database.sql)
