-- Existing project only: xbclkxeexrhdqhxafuad. No new Supabase project.
create table public.meday_journals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload->'records') = 'array'
    and jsonb_typeof(payload->'exercises') = 'array'
    and jsonb_typeof(payload->'goals') = 'object'
    and jsonb_typeof(payload->'evaluations') = 'object'
    and jsonb_typeof(payload->'dayEvaluations') = 'object'
  ),
  revision bigint not null default 1 check (revision > 0)
);
alter table public.meday_journals enable row level security;
revoke all on public.meday_journals from anon;
grant select, insert, update, delete on public.meday_journals to authenticated;
create policy meday_owner on public.meday_journals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meday-photos', 'meday-photos', false, 5242880, array['image/jpeg','image/png','image/webp']);
create policy meday_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'meday-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy meday_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'meday-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy meday_photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'meday-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Deliberately no UPDATE policy: content-addressed photos are immutable.
