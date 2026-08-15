# M7 Revision Brief — Round 3 (narrow — both reviewers Request changes)

**Author:** GLM only. `thinking: { type: "disabled" }`.  
**Scope:** Fix blocking findings only. Do not regenerate unrelated files.

## Blocking fixes (required)

### F1 — `admin.status.in_progress` key (Claude MAJOR-1 + Codex)
- In `app/lib/i18n.ts`: add `"admin.status.in_progress"` with AR+EN (same copy as `inProgress`), **or** change admin badge to look up `STATUS_OPTIONS` labelKey instead of interpolating DB snake_case.
- Prefer lookup via STATUS_OPTIONS if that map already exists in admin page — avoids future footguns.

### F2 — document `dir`/`lang` restore (Claude MAJOR-2 + Codex)
Pick **both** of these (safest):
1. On login-form, cashier/page, admin/page: in the `useEffect` that sets `document.documentElement.lang/dir`, **return a cleanup** that restores previous `lang`/`dir` (capture before set; restore on unmount).
2. On `app/auditor/page.tsx`: add `dir="rtl"` and `lang="ar"` on the main authenticated `<main>` (and loading shell if needed) so the Arabic-only auditor cannot inherit LTR from a prior EN session.

Emit full updated `app/auditor/page.tsx` — only these dir/lang additions plus keep all existing auditor logic.

### F3 — English mode still shows Arabic helper errors (Codex MAJOR)
In `app/cashier/page.tsx`, where you display messages from `saveClosing` / analyze API / duplicate helpers that return Arabic strings: map known messages through `t(locale, …)` **or** add bilingual keys and translate at the display boundary. Do not rewrite `closings.ts` / API route unless a tiny helper is cleaner. Minimum: common save/AI/offline/duplicate errors shown on the cashier UI must be bilingual when locale is `en`.

### F4 — `resolved_at` note-only overwrite (Claude MINOR / Codex MINOR — fix while here)
In `app/lib/tickets.ts` `updateTicket`: only set `resolved_at` when status **transitions into** `resolved` or `closed`; clear or leave null when moving to open/in_progress; do **not** refresh `resolved_at` if status is unchanged. Reject empty patches with a clear Error.

## Files you may emit (full bodies only)

1. `app/lib/i18n.ts` (if adding keys for F1/F3)
2. `app/lib/tickets.ts` (F4)
3. `app/admin/page.tsx` (F1 lookup if needed)
4. `app/login-form.tsx` (F2 cleanup)
5. `app/cashier/page.tsx` (F2 cleanup + F3 display mapping)
6. `app/auditor/page.tsx` (F2 rtl on main)
7. Optionally `FOUNDATION.md` one-line note that R3 addressed review Majors — **do not truncate**

Do **not** re-emit migration 006, dashboard-sections, locale-toggle, types, CUTOVER unless a one-line import fix is required.

## Output

`===FILE===` / `===ENDFILE===` full files. End with `END_M7`.
