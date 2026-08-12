# Implementation Brief — M2 Cashier flow

**Constitution:** Model Constitution  
**Author:** GLM-5.2 only  
**Review after:** Claude → Codex  

## User request
Prep done; start M2.

## Scope (M2 only)

Build cashier portal for Daily Financial Closing on existing M1 skeleton.

1. **Branch selection / lock**
   - Load branches from Supabase `public.branches` (id, name, city) via `getSupabase()`.
   - Fallback: import static list from `supabase/seed_branches.json` if Supabase not configured or query fails.
   - Cashier mode: once a branch is chosen, lock it (`isBranchLocked`) show read-only badge; allow change only via explicit “تغيير الفرع” confirm.
   - Persist `branchId` / `branchName` in localStorage for session.

2. **3-step wizard on `/cashier`** (client components as needed)
   - **Step 1 — Upload & capture:** businessDate; main Z-report image file input; optional Mada / cash deposit / Visa proof inputs; optional manualActualCash. Store files in component state (upload to Supabase Storage bucket `closing-images` if configured; otherwise keep as local object URLs / base64 for M2 and clearly TODO for production).
   - **Step 2 — Review numbers:** For M2, **manual entry form** for FinancialFields (no GLM API yet — that is M3). Show shortageOrExcess = cashActualHanded - cashSystem live. Disable submit while `isSaving`.
   - **Step 3 — Confirmation:** On save, insert into `daily_closings` if table exists; else save to localStorage queue and show success with generated id `close-{timestamp}`. Status pending Arabic badge «بانتظار اعتماد الإدارة المالية». Buttons: new submission / back home.

3. **Duplicate guard**
   - Before insert, check existing closing for same `branchId` + `businessDate` (Supabase or localStorage). If exists, require confirm dialog before overwrite/second submit.

4. **SQL companion (optional file only)**
   - May add `supabase/migrations/002_daily_closings.sql` for `daily_closings` + storage bucket notes — do not invent Gemini.

5. **Out of scope**
   - GLM `/api/analyze-closing-image` (M3)
   - Auditor tabs (M4)
   - Do not replace `.gitignore` wholesale
   - No secrets in files

6. Must keep `npm run build` green. Arabic RTL. Design tokens already in globals.

## Return
Unified diff only, END_DIFF. Correct hunk counts. Do not add new-file hunk for existing files — modify with context when needed.
