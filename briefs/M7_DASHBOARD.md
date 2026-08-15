# Implementation Brief — M7 Cashier dashboard + bilingual + IT tickets DB

**Constitution:** Model Constitution  
**Author:** GLM only  
**Review after:** Claude → Codex  
**Brand:** luxuryprep (never Pulse Cafe)  
**No Firebase. No Gemini. No new npm dependencies.**

## Output format

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

No markdown fences. No diffs. No ellipsis stubs. End with `END_M7`.

## Locked product decisions (user 2026-08-15)

1. **Bilingual AR + EN** — every NEW user-facing chrome in this milestone. Default locale Arabic. Persist preference in `localStorage` key `luxuryprep_locale` (`ar` | `en`). Arabic → `dir="rtl"`; English → `dir="ltr"`.
2. **Database first** — ship `supabase/migrations/006_it_support_tickets.sql` matching `supabase/PLANNED_006_it_tickets.md` (same table/columns/RLS). Idempotent; comments like 001–005.
3. **Do not rebuild daily closing** — keep the existing 3-step wizard logic, save/AI/duplicate guards intact. Wrap dashboard UI **above** it.
4. **Pre-close checklist** — UI-only via `localStorage` (key e.g. `luxuryprep_preclose_checklist_<branchId>_<businessDate>`). Six items + progress %. No checklist table.
5. **IT Status widget** — demo/static badges only (Foodics / مدى / printer) — no live APIs.
6. **IT tickets** — modal on cashier → INSERT `it_support_tickets`; `/admin` lists + can UPDATE status / admin_note.
7. **Incremental i18n** — translate: locale toggle, cashier dashboard chrome (header, checklist, IT status, ticket modal), login page chrome, admin ticket queue. Closing wizard step copy may stay Arabic in this milestone if token budget is tight — but `dir` and page shell must follow locale. Prefer translating wizard chrome (titles/buttons) if you can without breaking logic.

## Schema — `006_it_support_tickets.sql`

Follow `supabase/PLANNED_006_it_tickets.md` exactly:

- Table `public.it_support_tickets` with columns listed there
- RLS: INSERT + SELECT + UPDATE for `anon, authenticated`; no DELETE
- `id text primary key` (app can generate `ticket-<timestamp>` or similar)
- FK `branch_id` → `branches(id)`

Also add a short note at top of `supabase/CUTOVER.md` or a one-line in README that user must run 006 in SQL Editor (same pattern as 005). Prefer editing `supabase/CUTOVER.md` checklist only — do not rewrite the whole runbook.

## App files to produce / change

### New

1. `supabase/migrations/006_it_support_tickets.sql`
2. `app/lib/i18n.ts` — `Locale`, `getLocale`/`setLocale`, `t(locale, key)`, dictionary with AR+EN for all strings introduced here (and login/admin/cashier dashboard). Financial term pairs consistent (Gross sales / إجمالي المبيعات, etc. where shown).
3. `app/lib/tickets.ts` — `createTicket`, `listTickets`, `updateTicket` using lazy `getSupabase()`; offline/local fallback optional (match closings style lightly — if Supabase missing, surface clear error; do not invent a second offline queue unless simple).
4. `app/components/locale-toggle.tsx` — small AR|EN control using i18n helpers.
5. `app/cashier/dashboard-sections.tsx` (or split files) — checklist + IT status + ticket modal; bilingual props (`locale`, branch, onTicketCreated). Keep presentational; ticket insert via `tickets.ts`.

### Modify

6. `app/cashier/page.tsx` — Integrate dashboard above the existing wizard. Add locale state + `dir={locale==='ar'?'rtl':'ltr'}`. Keep session guard, logout, branch lock, all closing save/AI logic. Do **not** remove M2–M6 behavior. File is large — return the **full** updated file.
7. `app/admin/page.tsx` — Replace empty “ready for features” placeholder with ticket queue: list open tickets, filter by status, set status / admin_note, bilingual + locale toggle + logout. Keep admin session guard.
8. `app/login-form.tsx` and/or `app/page.tsx` — locale toggle + bilingual labels for tabs/fields/buttons (luxuryprep brand stays).
9. `FOUNDATION.md` — mark M7 done when complete (do **not** truncate the file; only append/update the milestones section and bilingual notes already present).
10. Delete or mark obsolete: update `supabase/PLANNED_006_it_tickets.md` to say “superseded by migration 006” OR leave a one-line status — optional.

### Types

11. If useful, add `ItSupportTicket` to `app/types/index.ts` (full file rewrite OK if small change).

## Cashier dashboard UX (adapt Pulse-style to luxuryprep)

Above the closing card:

1. **Header** — brand/luxuryprep or “شاشة الفرع”, locked branch name, locale toggle, logout, button “فتح تذكرة IT / Open IT ticket”.
2. **Pre-close checklist** — 6 bilingual items (e.g. cash counted, Z-report ready, Mada settled, tips recorded, safe drop, manager notified — pick sensible closing ops items). Checkbox state local; show % complete.
3. **IT Status** — three static rows with green/amber demo badges (Foodics / مدى / Printer). Label clearly as demo/status sample in EN+AR.
4. **Existing closing wizard** — unchanged behavior below.

## Admin UX

- Table/list of tickets: id, branch, category, priority, subject, status, created_at
- Click/expand → description + admin_note field + status select + save
- Empty state bilingual
- No Firebase settings UI

## Out of scope

- Supabase Auth users  
- Live Foodics/hardware APIs  
- Checklist DB table  
- Rewriting auditor portal i18n (can leave Arabic-only this round)  
- New packages  
- Changing GLM vision route / closings migrations 001–005  

## Constraints

- `"use client"` where hooks are used  
- Lazy `getSupabase()` only  
- `npm run build` must stay green  
- No secrets in committed files  
- Match existing slate/emerald design tokens / `card-frame` if present  
- Lucide icons only  

## Handoff note for reviewers

List touched files at the end before `END_M7` as a plain comment line is optional; prefer just `END_M7`.
