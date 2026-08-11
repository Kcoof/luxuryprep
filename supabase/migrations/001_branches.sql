-- Daily Financial Closing — branches seed
-- Run once in Supabase Dashboard → SQL Editor → New query → Run
-- Note: B19 intentionally absent (not provided in source list)

create table if not exists public.branches (
  id text primary key,
  name text not null,
  city text not null default '',
  created_at timestamptz not null default now()
);

alter table public.branches enable row level security;

-- Allow read for anon/authenticated (cashier/auditor need branch list). Tighten later with roles.
drop policy if exists "branches_select_all" on public.branches;
create policy "branches_select_all"
  on public.branches
  for select
  to anon, authenticated
  using (true);

insert into public.branches (id, name, city) values
  ('B01', 'فرع الحويه', ''),
  ('B02', 'فرع الطايف (وج)', ''),
  ('B03', 'فرع طريق الشفا (السداد)', ''),
  ('B04', 'فرع جبره سكوير خدمه سيارات', ''),
  ('B05', 'فرع الهدا خدمه سيارات', ''),
  ('B06', 'فرع طريق المطار خدمه سيارات', ''),
  ('B07', 'فرع الوسام', ''),
  ('B08', 'فرع طريق السيل (محطه لتر)', ''),
  ('B09', 'فرع بوليفارد الفيصل', ''),
  ('B10', 'فرع طريق الجنوب', ''),
  ('B11', 'فرع الجامعه', ''),
  ('B12', 'فرع مكة (الشرايع)', ''),
  ('B13', 'فرع الشوقية (حي الملك فهد)', ''),
  ('B14', 'فرع خطوات الصحة', ''),
  ('B15', 'فرع الهدا (محطة ساسكو)', ''),
  ('B16', 'فرع مستشفى الملك عبدالعزيز', ''),
  ('B17', 'فرع معشي', ''),
  ('B18', 'فرع تيرا مول', ''),
  ('B20', 'فرع جدة', ''),
  ('B21', 'فرع محطة درب (المطار)', '')
on conflict (id) do update set
  name = excluded.name,
  city = excluded.city;
