# Implementation Brief — M6 Login gateway + session + IT shell

**Constitution:** Model Constitution  
**Author:** GLM only  
**Review after:** Claude → Codex

## Output format

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

No markdown fences. No diffs. No ellipses. End with `END_M6`.

## User-locked decisions (2026-08-15)

- **Same visual design** as the pasted Pulse Cafe login (tabs, card, emerald/slate, RTL).
- **No Firebase** — no `FirebaseConfigModal`, no Firebase imports, no connection settings button.
- **Brand: luxuryprep** — not “Pulse Cafe”. Arabic title around بوابة الإغلاق المالي والمراجعة / luxuryprep.
- **Database: Supabase** — validate cashier branch against `public.branches` via existing `getSupabase()` / branch load pattern.
- **IT panel included and ready** — admin login lands on a shell page we can fill later.

## Roles → routes

| Tab | Role stored | After success |
|-----|-------------|----------------|
| الفرع / الكاشير | `cashier` (or `manager`) | `/cashier` with branch locked |
| المراجعة المالية | `auditor` | `/auditor` |
| مسؤول IT | `admin` | `/admin` (new IT shell) |

## Demo credentials (v1)

Read from env with safe defaults (document in `.env.local.example`):

- Finance: `LOGIN_FINANCE_USER` / `LOGIN_FINANCE_PASSWORD` (default `finance` / `finance`)
- Admin: `LOGIN_ADMIN_USER` / `LOGIN_ADMIN_PASSWORD` (default `admin` / `admin`)

These are **NEXT_PUBLIC_** only if needed client-side — prefer a tiny `app/lib/auth.ts` that reads `process.env.NEXT_PUBLIC_LOGIN_*` for demo v1, or hardcode defaults matching the design note, with comment that Supabase Auth replaces this later. Do **not** invent a users table in this milestone.

## Session (`app/lib/session.ts` or `app/lib/auth.ts`)

Single source of truth in `localStorage`, e.g. key `luxuryprep_session`:

```ts
{ role: 'cashier' | 'auditor' | 'admin', branchId?: string, branchName?: string, at: string }
```

Also keep cashier branch lock compatible with existing cashier page:
- Today cashier uses `cashier_selected_branch` — on cashier login, **write both** the new session AND the existing `cashier_selected_branch` shape the cashier page already reads, so M2/M3/M4 behavior does not break.
- Read `app/cashier/page.tsx` for the exact localStorage key/shape before coding.

Helpers: `getSession`, `setSession`, `clearSession`, `requireRole(...)`.

## Files to produce / change

1. `app/page.tsx` — replace home links with the Login UI (client component; may split `app/login-form.tsx` if cleaner).
2. `app/lib/auth.ts` (or session) — session + credential check + branch validate.
3. `app/admin/page.tsx` — **IT shell**: Arabic RTL, luxuryprep branding, logout, short “لوحة مسؤول IT — جاهزة للميزات القادمة”, links back/logout. No fake Firebase settings.
4. `app/cashier/page.tsx` — light guard: if no cashier session (or no branch), `redirect`/`router.replace` to `/`. Add logout control in header if missing. Do **not** rewrite the closing wizard.
5. `app/auditor/page.tsx` — same: require auditor (or admin) session; logout. Do not rewrite tabs.
6. `.env.local.example` — document optional `NEXT_PUBLIC_LOGIN_FINANCE_USER` etc.
7. `FOUNDATION.md` — one short note that M6 login gateway is in progress/done when you finish; brand luxuryprep; no Firebase.

## Branch login UX

- Prefer a **select** of branches from Supabase (id + name), not numeric-only `1001` pattern — our IDs are `B01`…`B21`.
- Still allow typing an id if that fits the design; validate against loaded list.
- On success: persist branch, go `/cashier`.

## Out of scope

- Supabase Auth email/password tables  
- Real hashed users  
- Firebase anything  
- New auditor/cashier business features  
- New npm dependencies  

## Constraints

- `"use client"` where hooks are used.  
- Lazy `getSupabase()` only.  
- Arabic RTL. `npm run build` green.  
- No secrets committed.  
- Do not touch GLM API route or migrations unless strictly needed (none needed).
