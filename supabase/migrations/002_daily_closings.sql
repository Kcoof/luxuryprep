-- Daily Financial Closing — daily_closings + audit log tables
-- Run once in Supabase Dashboard → SQL Editor → New query → Run
-- Path: supabase/migrations/002_daily_closings.sql

create table if not exists public.daily_closings (
  id text primary key,
  branch_id text not null references public.branches(id),
  business_date date not null,
  status text not null default 'pending',
  z_report_image_url text,
  payment_proof_image_urls text[],
  reviewed_data jsonb,
  manual_actual_cash numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_closings enable row level security;

-- Allow INSERT for anon/authenticated (cashiers submit closings)
drop policy if exists "daily_closings_insert_all" on public.daily_closings;
create policy "daily_closings_insert_all"
  on public.daily_closings
  for insert
  to anon, authenticated
  with check (true);

-- Allow SELECT for anon/authenticated (needed for duplicate check)
drop policy if exists "daily_closings_select_all" on public.daily_closings;
create policy "daily_closings_select_all"
  on public.daily_closings
  for select
  to anon, authenticated
  using (true);

-- Audit log table
create table if not exists public.daily_closing_audit_logs (
  id uuid primary key default gen_random_uuid(),
  closing_id text not null references public.daily_closings(id) on delete cascade,
  actor_role text not null,
  actor_id text,
  action text not null,
  comment text,
  timestamp timestamptz not null default now()
);

alter table public.daily_closing_audit_logs enable row level security;

drop policy if exists "daily_closing_audit_logs_insert_all" on public.daily_closing_audit_logs;
create policy "daily_closing_audit_logs_insert_all"
  on public.daily_closing_audit_logs
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "daily_closing_audit_logs_select_all" on public.daily_closing_audit_logs;
create policy "daily_closing_audit_logs_select_all"
  on public.daily_closing_audit_logs
  for select
  to anon, authenticated
  using (true);
