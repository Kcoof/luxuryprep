---
name: luxuryprep-ux-ui
description: >-
  UX and UI design standards for the luxuryprep Daily Financial Closing & POS
  Audit System (Next.js App Router, Arabic RTL + English LTR, slate/emerald
  finance UI). Use when designing, redesigning, polishing, or building any
  user-facing screen, component, modal, form, empty/error/loading state, or
  visual token work — especially login, cashier dashboard/wizard, auditor
  portal, IT admin tickets, locale toggle, and shared chrome. Also use when
  the user says polish UI, redesign, UX, layout, visual hierarchy, or make it
  look better.
disable-model-invocation: false
---

# luxuryprep UX + UI

Raise visual and interaction quality on **product UI** without fighting the locked finance design system or Model Constitution (GLM still authors implementation when that protocol is active).

## Where this skill applies (project map)

| Surface | Path | Priority |
|---------|------|----------|
| Login gateway | `app/page.tsx`, `app/login-form.tsx` | High — first impression + brand |
| Cashier dashboard + closing wizard | `app/cashier/page.tsx`, `app/cashier/dashboard-sections.tsx` | Highest — daily ops, mobile |
| Auditor portal | `app/auditor/page.tsx` | High — dense data, gated reports |
| IT admin / tickets | `app/admin/page.tsx` | High — triage queue |
| Shared chrome | `app/components/*`, `app/lib/i18n.ts`, `app/globals.css`, `app/layout.tsx` | Always with UI changes |

**Do not use this skill as the driver for:** API routes, Supabase migrations, GLM vision logic, seed SQL, or pure backend refactors — unless the change is only copy/empty-state on a related screen.

## Locked product look (do not reinvent)

- **Brand:** luxuryprep (never Pulse Cafe / Firebase leftovers).
- **Palette (CSS vars in `app/globals.css`):** slate-50/900/950 framing; white content; **emerald** success/verified; **amber** pending; **rose** shortage/reject.
- **Density:** Finance product — clear hierarchy, scannable forms/tables, not a marketing landing page.
- **Currency:** SAR. Financial labels via i18n pairs (AR/EN).
- **Bilingual:** Every new/changed user-facing string AR + EN. Arabic → `dir="rtl"`; English → `dir="ltr"`. Prefer `app/lib/i18n.ts` + `LocaleToggle`. See `.cursor/rules/bilingual-ar-en.mdc`.
- **Icons:** Lucide only. **Cards:** use `card-frame` (or equivalent) for interactive/content panels — not decorative card spam.

## UX checklist (every screen change)

Copy and track:

```
UX Progress:
- [ ] One primary job per view/section
- [ ] Hierarchy: title → action → content (no competing CTAs)
- [ ] Loading / empty / error / success all covered (bilingual)
- [ ] Forms: labels, validation, disabled/saving states
- [ ] Mobile: cashier usable one-handed; touch targets ≥ 44px
- [ ] RTL and LTR both checked for the touched UI
- [ ] Destructive actions confirmed; money fields unambiguous
```

### Role-specific UX

- **Cashier:** Speed and clarity. Dashboard (checklist / IT status / ticket) must not bury the closing wizard. Shortage/excess must be impossible to miss.
- **Auditor:** Approvals first; gated reports stay clearly locked/unlocked; split review (image vs numbers) stays readable.
- **Admin IT:** Ticket queue scannable by status/priority; detail/edit without leaving context.

## UI craft rules

1. **Composition:** One clear composition per viewport; avoid “random dashboard widgets.”
2. **Typography:** Prefer purposeful stacks that work for Arabic + Latin (current: Segoe UI / Tahoma / system). Do not default to Inter/Roboto-only aesthetics that break Arabic.
3. **Spacing:** Consistent vertical rhythm; align columns in forms and tables.
4. **Color:** Semantic only (emerald/amber/rose/slate). Avoid purple-on-white gradients, glow stacks, cream+terracotta “AI default” looks, dark-mode-by-default.
5. **Motion:** 2–3 intentional transitions max (e.g. step change, modal open). No noisy animation.
6. **Marketing-only rules:** Full-bleed hero / brand-over-headline rules apply **only** if building a true marketing/landing surface. App portals follow the finance system above.
7. **Preserve:** Existing tokens, `card-frame`, and portal patterns unless the user asks for a visual refresh.

## Implementation notes

- Match existing Tailwind + component patterns in the portal you touch.
- Prefer shared components over one-off styled blocks when the same chrome repeats (header, locale, logout).
- After UI edits: sanity-check both locales and a narrow mobile width for cashier.
- If Model Constitution is active for the task: this skill guides **review criteria and briefs**; GLM remains the author of code.

## Anti-patterns

- English-only or Arabic-only new chrome
- Replacing the slate/emerald system with a generic SaaS purple theme
- Card grids with no interactive purpose
- Hiding primary closing/approve actions behind secondary chrome
- Breaking auditor RTL when testing English on other portals (restore `dir` / pin auditor `dir="rtl"`)
