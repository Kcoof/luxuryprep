-- M4: Auditor fields + UPDATE policy for daily_closings
-- Run once in Supabase Dashboard → SQL Editor → New query → Run
-- Path: supabase/migrations/005_auditor.sql
--
-- Adds auditor columns and an UPDATE policy so the auditor portal can
-- approve/reject closings. Idempotent. Does not weaken existing INSERT/SELECT
-- policies and adds no DELETE policy (the table remains non-deletable via RLS).

alter table public.daily_closings
  add column if not exists auditor_id text;

alter table public.daily_closings
  add column if not exists auditor_comment text;

alter table public.daily_closings
  add column if not exists auditor_reviewed_at timestamptz;

-- Allow UPDATE for anon/authenticated (auditor approve/reject).
-- v1 has no auth wall, matching the open INSERT/SELECT policies in 002.
drop policy if exists "daily_closings_update_all" on public.daily_closings;
create policy "daily_closings_update_all"
  on public.daily_closings
  for update
  to anon, authenticated
  using (true)
  with check (true);