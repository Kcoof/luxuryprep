# GLM M2 revision — fix blocking defects

Your prior diff is REJECTED for apply. Produce a corrected unified diff.

## Hard requirements
1. Every file hunk MUST start with `diff --git a/path b/path` then `---` / `+++` / `@@`.
2. Put code under `app/` not root `lib/`:
   - Extend `app/types/index.ts` (do NOT invent parallel FinancialFields).
   - Keep FOUNDATION fields: grossSales, netSales, cashSystem, cashActualHanded, spanSystem, deliveryAppsSystem, reversedTransactions, shortageOrExcess.
   - Helpers in `app/lib/branches.ts`, `app/lib/closings.ts` using existing `app/lib/supabase.ts` `getSupabase` / `isSupabaseConfigured`.
3. Replace `app/cashier/page.tsx` with client 3-step wizard.
4. Use EXISTING `supabase/seed_branches.json` (B01–B21). Do not invent ryd-001 etc. Do not rewrite the JSON.
5. Optional: add only `supabase/migrations/002_daily_closings.sql`.
6. Exact hunk line counts. End with END_DIFF.
7. Compact: prefer fewer files; max focus on working cashier page.

Return ONLY the unified diff.
