# Implementation Brief — M5 Cutover (README / seed / ops)

**Constitution:** Model Constitution  
**Author:** GLM only  
**Review after:** Claude → Codex

## Output format

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

No markdown fences. No diffs. No ellipses. End with `END_M5`.

## Context

M1–M4 are **done and live** (cashier + GLM vision + auditor). Vercel GLM env is already set by the user. M5 is **documentation and cutover**, not new product features.

## Scope (M5 only)

### 1. `README.md` (new — project root)

Clear operator README in **English** (Arabic UI is in the app). Include:

- What the product is (Daily Financial Closing & POS Audit, KSA, SAR, Arabic RTL)
- Stack: Next.js 14 App Router, Supabase, Vercel, GLM vision (`glm-4.6v`)
- Local setup: Node, copy `.env.local.example` → `.env.local`, copy `.sec.example` → `.sec`, `npm install`, `npm run dev`
- Env table:
  - Client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Server (local `.env.local` or `.sec` + Vercel): `GLM_API_KEY`, `GLM_BASE_URL`, `GLM_VISION_MODEL` — **never** `NEXT_PUBLIC_`
- Supabase migrations **in order** with one-line purpose each:
  1. `001_branches.sql`
  2. `002_daily_closings.sql`
  3. `003_storage_closing_images.sql`
  4. `004_ai_extraction.sql`
  5. `005_auditor.sql`
  Plus optional seed: `supabase/seed_branches.sql` (you will create)
- Portals: `/cashier`, `/auditor`
- Note: B19 intentional gap (`supabase/BRANCHES.md`)
- Note: Auth roles deferred; v1 uses anon RLS like today
- Link to `FOUNDATION.md` for product constitution

### 2. `supabase/seed_branches.sql` (new)

Idempotent `insert ... on conflict (id) do update` for all rows in
`supabase/seed_branches.json` (20 branches, **no B19**). Match table columns
from `001_branches.sql`.

### 3. `supabase/CUTOVER.md` (new)

Short ops checklist:

- [ ] Migrations 001–005 run
- [ ] Seed branches run
- [ ] Storage bucket `closing-images` private
- [ ] Vercel env: Supabase public + GLM server trio
- [ ] Smoke: cashier submit → AI analyze → auditor approve → reports unlock
- [ ] Old Branch Health / Firebase sibling folders are **out of product scope** — do not merge; keep as archive reference only (do not delete other repos from this script)

### 4. `.env.local.example`

Extend with commented GLM server vars (pointing operators to also set them on Vercel), without putting real secrets.

### 5. `FOUNDATION.md`

Mark M5 **done** (date 2026-08-12). Clear obsolete “Post-M3 still open” / “Post-M4 user action” if those are complete. Keep open point about real Foodics photo validation.

## Out of scope

- No app feature code changes (`app/cashier`, `app/auditor`, API routes)
- No new npm deps
- No Supabase Auth user seeding (deferred)
- Do not delete or move folders outside this repo
- Do not touch `briefs/` staging trees

## Constraints

Keep docs accurate to the live stack. No invented Gemini. No secrets in files.
