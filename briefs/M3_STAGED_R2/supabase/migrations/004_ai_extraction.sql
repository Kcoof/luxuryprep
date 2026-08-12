-- M3: AI extraction metadata for daily_closings
-- Run once in Supabase Dashboard → SQL Editor → New query → Run
-- Path: supabase/migrations/004_ai_extraction.sql
--
-- Adds columns to track AI-extracted financial fields, model confidence,
-- and which fields the cashier modified after extraction. Idempotent.

alter table public.daily_closings
  add column if not exists ai_extracted_data jsonb;

alter table public.daily_closings
  add column if not exists ai_confidence jsonb;

alter table public.daily_closings
  add column if not exists manually_modified_fields text[];
