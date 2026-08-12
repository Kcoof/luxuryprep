# GLM M2 R5 — final focused fix (then apply)

Fix ONLY these Majors. Return full replacement unified diff. Raw diff --git only. END_DIFF.
**Exact hunk + counts MUST equal actual + lines** (cashier was 599 not 584; closings 202 not 194; sql 61 not 60).

## Fixes
1. Recount every hunk header correctly before emitting.
2. On successful Supabase save, ALSO write localStorage key `closing_${branchId}_${businessDate}` so duplicate fallback works when online.
3. Duplicate check: use `.select("id").limit(1)` not `.maybeSingle()`; on error fall back to localStorage.
4. If Storage upload fails: keep data URL in a local queue field for offline/queued saves; do NOT insert base64 into Postgres URL columns (leave null online).
5. Add storage bucket notes in migration comments; optional SQL to create bucket `closing-images` if supported.
6. When useManualCash: set reviewedData.cashActualHanded to the manual value before save so shortage reconciles.
7. businessDate default: local YYYY-MM-DD (not UTC toISOString).

Keep all prior Critical + R4 fixes (branch lock, session localStorage, new submission button, Arabic errors on insert fail, migration path `supabase/migrations/002_daily_closings.sql`, RLS policies).
