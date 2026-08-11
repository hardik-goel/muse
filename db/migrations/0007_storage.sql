-- 0007 — Storage buckets and their policies.
--
-- Thumbnails are never base64 in the database. Each capture writes a ≤260px
-- thumb to `item-thumbs/<user_id>/<item_id>.webp` and stores the path.
-- The bucket is private; the app serves it through an authenticated proxy.
--
-- Ordering note: `storage.buckets` is created by the Postgres image with only
-- (id, name, owner, created_at, updated_at). The columns this bucket wants —
-- public, file_size_limit, allowed_mime_types — are added later, by the storage
-- service's own migrations when that container first boots. This file therefore
-- inserts the row using only the guaranteed columns and applies the rest
-- conditionally, so a fresh `supabase db reset` succeeds whether the storage
-- service has ever run or not.

insert into storage.buckets (id, name)
values ('item-thumbs', 'item-thumbs')
on conflict (id) do nothing;

do $$
begin
  -- Private bucket. Anything readable without a session would defeat the point
  -- of serving thumbnails through /api/thumb.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public'
  ) then
    execute $sql$update storage.buckets set public = false where id = 'item-thumbs'$sql$;
  end if;

  -- 8 MB, matching the API limit in lib/server/storage.ts.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    execute $sql$update storage.buckets set file_size_limit = 8388608 where id = 'item-thumbs'$sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    execute $sql$
      update storage.buckets
         set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
       where id = 'item-thumbs'
    $sql$;
  end if;
end $$;

-- Path convention: the first folder segment is the owner's uuid.
drop policy if exists item_thumbs_select_own on storage.objects;
drop policy if exists item_thumbs_insert_own on storage.objects;
drop policy if exists item_thumbs_update_own on storage.objects;
drop policy if exists item_thumbs_delete_own on storage.objects;

create policy item_thumbs_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'item-thumbs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy item_thumbs_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-thumbs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy item_thumbs_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'item-thumbs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy item_thumbs_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-thumbs' and (storage.foldername(name))[1] = auth.uid()::text);
