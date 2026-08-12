-- Idempotent branch seed for public.branches
-- 20 rows from supabase/seed_branches.json. B19 is intentionally absent
-- (not present in source list). See supabase/BRANCHES.md.
--
-- Run AFTER 001_branches.sql in Supabase Dashboard → SQL Editor.
-- Safe to re-run: ON CONFLICT (id) DO UPDATE.

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