# Implementation Brief — UX batch: cashier follow-ups + auditor + admin

**Constitution:** Model Constitution — GLM authors  
**User order (2026-08-16):** «ok do it all commit and push to github» — polish remaining surfaces and ship.  
**Skill:** `.cursor/skills/luxuryprep-ux-ui/SKILL.md`

## Part A — Cashier follow-ups (Claude deferred Majors)

File: `app/cashier/page.tsx` only for this part.

1. **aiNotice tone:** When showing `aiNotice`, if the message equals `t(locale, "wizard.ai.noValues")` (or track a boolean `aiNoticeKind: "ok" | "empty"` when setting notice), use **neutral/amber slate** styling — NOT emerald + Check. When filled > 0 success notice, emerald + Check is OK.
2. **NumberInput a11y:** Add `id` prop (or generate from label), put `htmlFor` on `<label>`, set `aria-describedby` to the error `<p>` id when `error` is true. Wire all NumberInput call sites with stable ids (e.g. `field-grossSales`).

Do not change save/AI/duplicate logic.

## Part B — Auditor UX polish

File: `app/auditor/page.tsx` (full).

- Keep **Arabic-only** this round (dir="rtl" lang="ar" already). Do **not** add full i18n unless trivial.
- Visual polish only: hierarchy, `min-h-11` touch targets, focus rings, restrained slate/emerald/amber/rose, clearer gated-reports lock state, denser but readable approvals list/modal.
- **Do not change** approve/reject/report gating business logic.
- Match login/cashier craft: less glow, clearer headers, Lucide only.

## Part C — Admin IT tickets UX polish

File: `app/admin/page.tsx` (full). Optional tiny touch to shared components only if needed.

- Bilingual keep (`t` + LocaleToggle + dir restore).
- Polish ticket queue: clearer filters, status badges, empty/loading/error, touch targets, card-frame restraint.
- **Do not change** listTickets/updateTicket behavior or session guard.

## i18n

**Do NOT regenerate `app/lib/i18n.ts`.** Reuse existing keys. If a new string is unavoidable, list it in `briefs/UX_BATCH_I18N_KEYS.md` only (key + ar + en).

## Forbidden

- Rewriting closings.ts / analyze route / tickets.ts logic  
- Firebase / purple themes / glow stacks  
- Truncating files mid-output — every FILE must close with ENDFILE  

## Output

```
===FILE: path===
<entire file>
===ENDFILE===
```

Emit: `app/cashier/page.tsx`, `app/auditor/page.tsx`, `app/admin/page.tsx`, and optional `briefs/UX_BATCH_I18N_KEYS.md`.  
End with `END_UX_BATCH`.
