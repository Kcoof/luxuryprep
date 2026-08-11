# Foundation Record — Branch Health (`Newproject`)

**Status:** Confirmed (user-adjusted)  
**Date:** 2026-08-11  
**Project Constitution:** Active → settled  
**Next:** Model Constitution (GLM authors; Claude → Codex review; CUROK transport)

---

## Core idea

Internal IT tool for a coffee company. Store **branches** submit daily tech-health reports; **IT admins** monitor every branch from one dashboard. Entire UI is **Arabic**, right-to-left (RTL).

## Vision

`npm install && npm run build` succeeds; app runs locally and on **Vercel**; Supabase project is seeded; branch and admin flows match product behavior from `BUILD_PROMPT.md` (UX/pages), with the backend remapped to Supabase.

## Structure + hierarchy

**Canonical home:** this folder (`Newproject`) only. Sibling `branch-health` / `branch-health-fresh` are **read-only Firebase reference**, then archived after cutover.

**Decision order:** User → Project Constitution (this record) → Model Constitution → GLM authors → Claude review → Codex review → CUROK byte-for-byte apply.

**Technical order:** Postgres schema / types → Supabase client → UI kit → pages → RLS + Storage policies → Vercel env + seed docs.

**Layout (single app at repo root):** Next.js App Router under `app/`; shared `app/types`, `app/lib` (Supabase client), `app/components`; SQL migrations under `supabase/`.

## Feasibility across empires

| Empire | Verdict |
|--------|---------|
| Product / UX | Pass — pages and roles from BUILD_PROMPT / siblings |
| Supabase + Vercel | Pass — `@supabase/supabase-js`, env vars on Vercel |
| Arabic RTL / Windows | Risk — UTF-8 no BOM; avoid PowerShell `>` for Arabic files |
| Multi-model workflow | Pass — small milestones |
| Firebase siblings | Reference only — do **not** ship Firestore in v1 |

## Database lock (user override 2026-08-11)

**Main database: Supabase (Postgres).**  
**Storage: Supabase Storage.**  
**Live admin updates: Supabase Realtime.**  
Firebase / Firestore is **out of scope for v1**.

### Auth (v1 with Supabase)

- **Admin:** Supabase Auth (email + password). No plaintext `admins.password` table.
- **Branch:** Branch-code login against `branches` table (same UX as BUILD_PROMPT); session in `localStorage` (`branchId` / `branchName`).

### Tables (map from former Firestore collections)

- `branches` — id (text PK, e.g. `1001`), name, address, phone, created_at  
- `daily_reports` — branch health reports (status, systems, notes, photo URLs, date, time)  
- `issues` — auto-created from checklist failures  
- `visit_requests` — IT visit requests + optional photo  
- `comments` — admin comments on a branch  
- Profiles / role claim for admins via Supabase Auth (not a plaintext password store)

## Clear foundation checklist

**Understood**

- [x] Product = Branch Health (Arabic RTL)
- [x] Canonical repo = `Newproject`
- [x] Main DB = Supabase (user-approved)
- [x] Deploy target = Vercel
- [x] GLM sole author under Model Constitution after this record
- [x] BUILD_PROMPT is UX/product contract; stack backend is Supabase, not Firebase

**Open (non-blocking for M1)**

- [ ] Exact Supabase project URL / keys (user supplies in `.env.local`, never commit)
- [ ] Whether branch codes stay opaque text IDs (`1001`) — default: yes

## v1 scope / out of scope

**In v1:** Full Branch Health UX; Arabic RTL; Supabase Postgres + Storage + Realtime; admin via Supabase Auth; Vercel-ready; build green; seed SQL/docs; RLS that is not world-open.

**Out of v1:** Firebase/Firestore; mobile apps; multi-company tenancy; analytics beyond the six admin stats; editing sibling Firebase folders after cutover.

## Glossary

- **Empire** — platform/domain/stack the project must work in  
- **Canonical** — the one copy that may be edited (`Newproject`)  
- **Transport** — CUROK applies GLM output byte-for-byte only  
- **Sorted** — governed foundation + working v1 app, not a feature name  

## Open points escalated to user

None blocking. Supabase approved as main database (2026-08-11).

---

## Milestones (Model Constitution)

1. **M0** — This `FOUNDATION.md` (done when written)  
2. **M1** — Skeleton: Next configs, types, Supabase client, UI kit, page shells, `npm run build`  
3. **M2** — Branch flows: login, dashboard, checklist, visit + Storage  
4. **M3** — Admin flows: Auth, stats + Realtime, BranchCard, detail tabs + comments  
5. **M4** — SQL migrations, RLS, Storage policies, README seed, `.env.local.example`  
6. **M5** — Archive Firebase siblings as read-only reference  

---

`Foundation confirmed — hand off to model-constitution` (await user “start M1” / implementation request).
