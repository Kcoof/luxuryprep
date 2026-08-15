-- M7: IT support tickets for the cashier branch dashboard
-- Run once in Supabase Dashboard → SQL Editor → New query → Run
-- Path: supabase/migrations/006_it_support_tickets.sql
--
-- Creates public.it_support_tickets so cashiers can open IT tickets from
-- the branch dashboard (/cashier) and the IT admin can triage them
-- (/admin: status + admin_note). Matches supabase/PLANNED_006_it_tickets.md
-- exactly. Idempotent. Open anon posture matches 002/005 until real Auth.
-- No DELETE policy — tickets are never hard-deleted via RLS in v1.

create table if not exists public.it_support_tickets (
  id text primary key,
  branch_id text not null references public.branches (id),
  category text not null,                      -- pos | mada | printer | network | foodics | other
  priority text not null default 'normal',     -- low | normal | high | urgent
  subject text not null,
  description text not null,
  status text not null default 'open',         -- open | in_progress | resolved | closed
  created_by_role text not null default 'cashier',
  created_by_label text,
  admin_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.it_support_tickets is
  'IT support tickets opened from the cashier branch dashboard (M7).';

alter table public.it_support_tickets enable row level security;

-- INSERT for anon/authenticated (cashiers create tickets).
drop policy if exists "it_support_tickets_insert_all" on public.it_support_tickets;
create policy "it_support_tickets_insert_all"
  on public.it_support_tickets
  for insert
  to anon, authenticated
  with check (true);

-- SELECT for anon/authenticated (IT lists/reads tickets).
drop policy if exists "it_support_tickets_select_all" on public.it_support_tickets;
create policy "it_support_tickets_select_all"
  on public.it_support_tickets
  for select
  to anon, authenticated
  using (true);

-- UPDATE for anon/authenticated (IT status / notes) — same open posture
-- as daily_closings (005) until real Supabase Auth roles land.
drop policy if exists "it_support_tickets_update_all" on public.it_support_tickets;
create policy "it_support_tickets_update_all"
  on public.it_support_tickets
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- Keep updated_at fresh on every UPDATE (idempotent drop-then-create).
create or replace function public.set_it_support_tickets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists it_support_tickets_set_updated_at
  on public.it_support_tickets;
create trigger it_support_tickets_set_updated_at
  before update on public.it_support_tickets
  for each row execute function public.set_it_support_tickets_updated_at();
