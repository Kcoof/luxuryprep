# FOUNDATION — luxuryprep

بوابة الإغلاق المالي والمراجعة — علامة **luxuryprep** (واجهة عربية RTL، عملة الريال SAR).

## Core decisions

- **Brand:** luxuryprep — not "Pulse Cafe". All screens carry this brand.
- **Stack:** Next.js (App Router) + TypeScript + Tailwind CSS.
- **Data:** Supabase (Postgres + Storage) via lazy `getSupabase()` in `app/lib/supabase.ts`.
- **AI extraction:** server-only GLM vision route `/api/analyze-closing-image`; keys never leave the server.
- **No Firebase — ever.** No Firebase config modals, no Firebase imports, no connection settings buttons.
- **Session (demo v1):** single source of truth in `localStorage` key `luxuryprep_session` (see `app/lib/auth.ts`). Roles: `cashier | manager | auditor | admin`. Cashier login also mirrors the branch lock to the legacy `cashier_selected_branch` key so M2–M4 wizard behavior keeps working. Supabase Auth replaces the demo credential checks in a later milestone.

## Milestones

- **M1** — Types, skeletons, Supabase client. Done.
- **M2** — Cashier closing wizard with branch lock. Done.
- **M3** — GLM vision extraction (Z-report → fields). Done.
- **M4** — Auditor console: approvals, unified reports, audit log. Done.
- **M5** — Hardening pass (localized parsing, aborts, offline queue). Done.
- **M6 — Login gateway + demo session + IT shell. Done (2026-08-15).**
  - `/` is now the login gateway: tabs «الفرع / الكاشير»، «المراجعة المالية»، «مسؤول IT» (emerald/slate card, RTL, luxuryprep branding).
  - Cashier login = branch select validated against `public.branches` (typing an id like `B01` is allowed and validated against the same list) → `/cashier` with the branch locked (both session + legacy branch keys written).
  - Finance login (demo `finance`/`finance`, overridable via `NEXT_PUBLIC_LOGIN_FINANCE_*`) → `/auditor`.
  - IT login (demo `admin`/`admin`, overridable via `NEXT_PUBLIC_LOGIN_ADMIN_*`) → `/admin` (ready IT shell — no fake settings, no Firebase).
  - Cashier & auditor pages are guarded via `requireRole(...)` with logout controls; the closing wizard and auditor tabs are otherwise untouched.