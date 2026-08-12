# Daily Financial Closing & POS Audit (`luxuryprep`)

**نظام الإغلاق المالي اليومي والمراجعة للفروع**

A daily financial closing and POS audit system for multi-branch retail/restaurant
businesses in **Saudi Arabia**. Currency is **SAR**; the operator UI is **Arabic,
right-to-left**. Branch cashiers upload Foodics Z-report / closing images, **GLM
vision** extracts the financial fields, cashiers confirm, and financial auditors
approve or reject before unified reports and the digital audit log unlock.

> Product constitution, design system, milestone history and open points live in
> [`FOUNDATION.md`](./FOUNDATION.md). This README is the operator runbook.

---

## What this product is

- **Cashier portal** (`/cashier`) — 3-step daily closing submission:
  1. Upload Foodics Z-report image (+ optional payment proofs), pick business date,
     optionally enter actual cash handed.
  2. GLM vision extracts the financial fields; cashier reviews/edits; shortage or
     excess is computed automatically.
  3. Success card with Closing ID; status «بانتظار اعتماد الإدارة المالية».
- **Auditor portal** (`/auditor`) — 3 tabs:
  1. **Approvals** — pending / approved / rejected closings, split-screen review
     (image vs fields), approve or reject with comment.
  2. **Unified reports** — **gated** while any closing is pending; once clear,
     shows gross sales, actual cash, net shortage/excess, reversals/refunds;
     Excel/Print.
  3. **Audit log** — timeline of upload, AI extract + confidence, cashier edits,
     approve/reject.

Duplicate closings for the same `branchId` + `businessDate` are guarded — the
cashier must explicitly confirm before a second submission is allowed.

---

## Stack

| Layer | Choice |
|------|--------|
| Framework | **Next.js 14** (App Router) |
| Language | TypeScript + React 18 |
| Database / Storage / Auth | **Supabase** (Postgres + Storage + RLS) |
| Hosting | **Vercel** |
| Vision extraction | **GLM** (Z.ai Coding Plan) — `glm-4.6v` |
| UI | Tailwind, `lucide-react`, Arabic RTL (`dir="rtl"`) |

> **No Gemini.** Image extraction is GLM-only. `GLM-5.2` is text-only and rejects
> images; the production extraction model is **`glm-4.6v`**.

---

## Local setup

Requirements: **Node 18+** (Node 20 LTS recommended), npm.

```bash
# 1. Clone
git clone https://github.com/Kcoof/luxuryprep.git
cd luxuryprep

# 2. Copy env templates
cp .env.local.example .env.local     # Supabase client keys
cp .sec.example .sec                 # GLM server credentials (server-only)

# 3. Fill in real values in .env.local and .sec

# 4. Install
npm install

# 5. Run
npm run dev
```

Open http://localhost:3000 — portals live at `/cashier` and `/auditor`.

---

## Environment variables

> **Security rule:** any variable prefixed `NEXT_PUBLIC_` is shipped to the
> browser. **GLM credentials must NEVER use that prefix** — they are server-only
> and are read inside the Next.js API route.

| Variable | Scope | Where to set |
|----------|-------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | `.env.local` locally; Vercel project env |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | `.env.local` locally; Vercel project env |
| `GLM_API_KEY` | **Server only** | `.sec` locally; **Vercel** project env (no `NEXT_PUBLIC_`) |
| `GLM_BASE_URL` | **Server only** | `.sec` locally; Vercel (`https://api.z.ai/api/coding/paas/v4`) |
| `GLM_VISION_MODEL` | **Server only** | `.sec` locally; Vercel (`glm-4.6v`) |

`GLM_MODEL` (e.g. `GLM-5.2`) is the text-only authoring model and is not used by
the production vision flow. It can stay in `.sec` for tooling but is **not** read
by `/api/analyze-closing-image`.

---

## Database setup (Supabase)

Run these in **Supabase Dashboard → SQL Editor → New query → Run**, **in order**:

| # | File | Purpose |
|---|------|---------|
| 1 | [`supabase/migrations/001_branches.sql`](./supabase/migrations/001_branches.sql) | `branches` table + read RLS + inline seed |
| 2 | [`supabase/migrations/002_daily_closings.sql`](./supabase/migrations/002_daily_closings.sql) | `daily_closings` + `daily_closing_audit_logs` + RLS |
| 3 | [`supabase/migrations/003_storage_closing_images.sql`](./supabase/migrations/003_storage_closing_images.sql) | Private Storage bucket `closing-images` |
| 4 | [`supabase/migrations/004_ai_extraction.sql`](./supabase/migrations/004_ai_extraction.sql) | AI extraction columns (`ai_extracted_data`, `ai_confidence`) |
| 5 | [`supabase/migrations/005_auditor.sql`](./supabase/migrations/005_auditor.sql) | Auditor columns + approve/reject UPDATE RLS |

Optional (re-runnable) branch seed:

| File | Purpose |
|------|---------|
| [`supabase/seed_branches.sql`](./supabase/seed_branches.sql) | Idempotent `INSERT ... ON CONFLICT DO UPDATE` for all 20 branches (B19 intentionally absent) |

---

## Portals

- **Cashier** — http://localhost:3000/cashier
- **Auditor** — http://localhost:3000/auditor
- API (server-only) — `POST /api/analyze-closing-image` with body
  `{ imageBase64 }` (≈10 MB limit). Returns raw JSON:
  `grossSales`, `netSales`, `cashSystem`, `spanSystem`, `deliveryAppsSystem`,
  `reversedTransactions`.

---

## Known gaps & scope notes

- **B19 is intentionally absent** from the branch list (not in source data). See
  [`supabase/BRANCHES.md`](./supabase/BRANCHES.md).
- **Auth roles are deferred.** v1 uses anon RLS exactly as in production today —
  no Supabase Auth user seeding is performed. Tightening to cashier / manager /
  auditor roles is a future milestone.
- **Real Foodics photo validation is still open.** GLM was verified against a
  clean synthetic Z-report (10/11 fields exact); camera glare, skew and crumpled
  paper remain untested. See `FOUNDATION.md` → Open points.
- **Old Branch Health / Firebase sibling repos** are out of product scope. They
  are kept as archive reference only — do not merge and do not delete.

---

## Deploy (Vercel)

1. Push to `main` on https://github.com/Kcoof/luxuryprep — Vercel auto-builds.
2. In **Vercel → Project → Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GLM_API_KEY`, `GLM_BASE_URL`, `GLM_VISION_MODEL=glm-4.6v` (server-only)
3. Trigger a redeploy if env was added after the last build.

See [`supabase/CUTOVER.md`](./supabase/CUTOVER.md) for the full production
cutover checklist.

---

## Scripts

```bash
npm run dev     # Next dev server (port 3000)
npm run build   # Production build (CI gate)
npm run start   # Serve the production build locally
```

---

## Reference

- [`FOUNDATION.md`](./FOUNDATION.md) — product constitution, design system,
  milestone history, open points.
- [`supabase/CUTOVER.md`](./supabase/CUTOVER.md) — production cutover checklist.
- [`supabase/BRANCHES.md`](./supabase/BRANCHES.md) — branch code notes (incl.
  B19 gap).