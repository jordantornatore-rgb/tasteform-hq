-- Footage Jordan uploads from HQ (phone) for the Mac Mini pipeline to pull into footage/<rowId>/. Private, admin only.
-- Applied 4 Nov 2026. HQ stores a 7-day signed download link per file on the content_queue row (footageUpload.files[].url);
-- the Mac downloads through that link, so no storage key lives on the Mac.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-footage', 'content-footage', false, 5368709120,
        array['video/mp4','video/quicktime','video/x-m4v','video/webm','image/jpeg','image/png','image/heic','image/heif','audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "content footage admin read" on storage.objects for select to authenticated
  using (bucket_id = 'content-footage' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "content footage admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'content-footage' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "content footage admin update" on storage.objects for update to authenticated
  using (bucket_id = 'content-footage' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (bucket_id = 'content-footage' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "content footage admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'content-footage' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
