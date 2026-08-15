# Implementation Brief — Login UX/UI polish (luxuryprep-ux-ui skill)

**Constitution:** Model Constitution — GLM authors only  
**Skill:** `.cursor/skills/luxuryprep-ux-ui/SKILL.md`  
**Scope:** Login gateway visual + UX polish only. **Do not change** auth logic, session keys, credentials, branch validation, or routes.

## Files allowed

1. `app/login-form.tsx` — primary (full file)
2. `app/components/locale-toggle.tsx` — only if needed for visual harmony
3. `app/lib/i18n.ts` — only if adding keys for new chrome (keep AR+EN)
4. `app/globals.css` — optional small login-only utility (e.g. subtle motion). Prefer Tailwind in the form if enough.

Do **not** touch cashier/auditor/admin pages.

## Design goals (skill)

- **One job:** sign in to the right portal.
- **Brand first:** `luxuryprep` is the hero-level signal (wordmark/name dominant). Supporting title is secondary — do not let the long Arabic/English product title overpower the brand.
- **Palette:** slate + emerald only. No purple, no glow stacks, no cream/terracotta, no dark-mode default.
- **Composition:** one centered gateway card; quiet atmosphere (soft slate→emerald wash OK, keep restrained).
- **Motion:** 2–3 intentional transitions (e.g. tab panel fade, button press/focus ring). No noise.
- **Touch:** primary buttons and tabs ≥ ~44px height on mobile.
- **Bilingual:** keep existing `t()` / `LocaleToggle` / `dir` restore-on-unmount. New strings must be AR+EN in i18n.
- **Cards:** one interactive panel (`card-frame` or refined equivalent) — not stacked decorative cards.
- **Lucide** icons only.

## Keep behavior identical

- Tabs: cashier / finance / it
- Branch select + manual id
- Finance/admin credentials + show password
- Active session continue/logout
- `startCashierSession`, `setSession`, `router.replace` targets unchanged
- Demo footer stays

## Output

```
===FILE: path===
<entire file>
===ENDFILE===
```

End with `END_LOGIN_UX`. No markdown fences. No commentary.
