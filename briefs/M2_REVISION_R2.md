# GLM M2 — revision after Claude Critical review

Produce ONE applyable unified diff. End with END_DIFF.
Every hunk: `diff --git` + correct `@@` line counts. Every added line must start with `+`.
New files: include `new file mode 100644`.

## Must implement (blocking)

1. **Valid patch** that `git apply` accepts against current repo.
2. **Branch lock:** after cashier picks branch, `isBranchLocked=true`, read-only badge with branch name/id; change only via confirm «تغيير الفرع».
3. **Duplicate guard:** before save, check same branchId+businessDate (Supabase or localStorage). If exists, Arabic confirm dialog required. Offline must NOT silently accept duplicates without confirm.
4. **Migration RLS:** if adding `002_daily_closings.sql`, include INSERT/SELECT policies for `anon, authenticated` like 001_branches pattern (not RLS with zero policies).
5. Keep FOUNDATION `FinancialFields` in `app/types/index.ts` — do not invent mada/visa/expenses schema.
6. Paths under `app/`: `app/cashier/page.tsx`, `app/lib/branches.ts`, `app/lib/closings.ts`. Do NOT put `"use client"` on lib files — only on the page.
7. Load branches: Supabase `branches` first; fallback `supabase/seed_branches.json` (B01–B21 existing file — do not rewrite).
8. Use `useEffect` for loading branches (not useMemo side effects).
9. Step 3 success: show Closing ID like `close-{timestamp}` and status «بانتظار اعتماد الإدارة المالية».
10. Optional manualActualCash on step 1. Numeric inputs must allow clearing (don’t force Number("")→0 mid-edit).
11. Images: for M2, upload to Supabase Storage bucket `closing-images` when configured; else store data URLs in local queue and mark TODO — do not persist only filename as URL.
12. `npm run build` must stay green. Arabic RTL. No Gemini. No analyze API (M3).

## Current cashier page (replace entirely)
22-line M1 shell at app/cashier/page.tsx — use a proper modify hunk or delete+add with correct headers.

## Return
Unified diff only.
