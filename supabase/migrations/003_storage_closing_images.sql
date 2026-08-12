-- Daily Financial Closing — closing-images storage bucket + access policies
-- Run once in Supabase Dashboard → SQL Editor → New query → Run
-- Path: supabase/migrations/003_storage_closing_images.sql
--
-- Creates the bucket the cashier upload step writes to. Equivalent to
-- Storage → New bucket, but versioned alongside the other migrations.

-- Private bucket: Z-reports and payment proofs are financial records and must
-- not be world-readable. Reads go through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'closing-images',
  'closing-images',
  false,
  10485760, -- 10 MB, matches the ~10mb API route limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

-- Cashiers upload closing images.
drop policy if exists "closing_images_insert" on storage.objects;
create policy "closing_images_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'closing-images');

-- Read back for the confirmation UI and auditor review.
drop policy if exists "closing_images_select" on storage.objects;
create policy "closing_images_select"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'closing-images');

-- Allow overwrite/upsert of a re-uploaded image for the same closing.
drop policy if exists "closing_images_update" on storage.objects;
create policy "closing_images_update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'closing-images')
  with check (bucket_id = 'closing-images');

-- Deliberately no DELETE policy: submitted financial evidence is immutable.
