# M7 Revision Brief — Round 2 (complete truncated output)

**Cause:** Round 1 hit `finish_reason=length` (64k) with heavy reasoning; `app/cashier/page.tsx` truncated mid Step 3; admin/login/FOUNDATION not emitted.

**Author:** GLM only  
**Thinking:** MUST set `thinking: { type: "disabled" }` (caller will). Be concise — no long reasoning.

## Output format

Same as M7: `===FILE: path===` … `===ENDFILE===`. End with `END_M7`.

## Already complete in Round 1 (DO NOT regenerate unless a tiny fix is required)

These exist under `briefs/M7_STAGED/` and will be adopted as-is:

- `supabase/migrations/006_it_support_tickets.sql`
- `supabase/PLANNED_006_it_tickets.md`
- `supabase/CUTOVER.md`
- `app/lib/i18n.ts`
- `app/lib/tickets.ts`
- `app/types/index.ts`
- `app/components/locale-toggle.tsx`
- `app/cashier/dashboard-sections.tsx`

## You MUST emit FULL files for

1. `app/cashier/page.tsx` — **complete** file. Integrate dashboard + locale like Round 1 started. Preserve all closing wizard logic (AI, save, duplicate, session). Use `t(locale, …)` and `LocaleToggle`. Import dashboard sections from `./dashboard-sections`. Match Round 1’s approach; finish Step 3 + closing of component. Do not leave ellipses.

2. `app/admin/page.tsx` — bilingual ticket queue (list/filter/update status + admin_note), locale toggle, logout, session guard. Use `app/lib/tickets.ts` + `app/lib/i18n.ts`.

3. `app/login-form.tsx` — bilingual labels + locale toggle; keep luxuryprep, demo credentials, branch select, no Firebase.

4. `FOUNDATION.md` — **do not truncate**. Start from the CURRENT full FOUNDATION provided in context; only update milestones to mark M7 authored/in review and keep bilingual notes. Return the **entire** file.

## Optional if needed for compile

5. `app/page.tsx` — only if login-form integration requires it.

## Constraints

- No Firebase. No new deps. Brand luxuryprep.
- Bilingual AR+EN for new chrome.
- Do not rewrite `006` or i18n/tickets/dashboard-sections again.
- Keep cashier file complete so `npm run build` can pass.

End with `END_M7`.
