# Production cutover checklist — M5 / M7

Run this once per environment (Supabase project + Vercel project). Items are
ordered; do not skip.

## Database (Supabase SQL Editor)

- [ ] `001_branches.sql` — `branches` table + read RLS + inline seed
- [ ] `002_daily_closings.sql` — `daily_closings` + `daily_closing_audit_logs` + RLS
- [ ] `003_storage_closing_images.sql` — Storage bucket `closing-images`
- [ ] `004_ai_extraction.sql` — AI extraction columns
- [ ] `005_auditor.sql` — auditor columns + approve/reject UPDATE RLS
- [ ] `006_it_support_tickets.sql` — IT support tickets table + RLS (M7)
- [ ] `seed_branches.sql` — idempotent 20-branch seed (B19 intentionally absent)

## Storage

- [ ] Bucket `closing-images` is **private** (signed URLs only — never public)
- [ ] Anon role can CREATE / READ objects in `closing-images/*` per
      `003_storage_closing_images.sql` policies

## Vercel environment

- [ ] `NEXT_PUBLIC_SUPABASE_URL` set
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [ ] `GLM_API_KEY` set (server-only — **no** `NEXT_PUBLIC_` prefix)
- [ ] `GLM_BASE_URL` set to `https://api.z.ai/api/coding/paas/v4`
- [ ] `GLM_VISION_MODEL` set to `glm-4.6v`
- [ ] Production deploy rebuilt after env vars were added

## Smoke test (end-to-end)

- [ ] `/cashier` — pick branch → upload Foodics Z-report image → business date
- [ ] AI analyze returns extracted fields (`grossSales`, `netSales`, `cashSystem`,
      `spanSystem`, `deliveryAppsSystem`, `reversedTransactions`)
- [ ] Cashier confirms → success card with Closing ID, status «بانتظار اعتماد
      الإدارة المالية»
- [ ] `/auditor` → Approvals shows the new closing as **pending**
- [ ] Auditor approves (or rejects with comment) → status flips
- [ ] When `pendingCount = 0`, Unified Reports tab **unlocks**
- [ ] Audit Log shows upload → AI extract (+ confidence) → approve/reject
- [ ] `/cashier` (M7) — pre-close checklist persists per branch + date; demo IT
      status badges render; AR|EN toggle flips `dir` and chrome copy
- [ ] `/cashier` → «Open IT ticket» inserts a row into `it_support_tickets`
- [ ] `/admin` (M7) — ticket queue lists the new ticket; status + IT note save

## Archive hygiene

- [ ] Old Branch Health / Firebase sibling folders are **out of product scope** —
      do not merge into this repo; keep as archive reference only
- [ ] Do **not** delete or move other repositories from this script
