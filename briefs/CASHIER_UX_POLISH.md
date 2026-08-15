# Implementation Brief — Cashier UX/UI polish (luxuryprep-ux-ui)

**Constitution:** Model Constitution — GLM authors only  
**Skill:** `.cursor/skills/luxuryprep-ux-ui/SKILL.md`  
**Scope:** Visual + UX polish for `/cashier` only. **Do not change** closing wizard business logic (AI analyze, save, duplicate guard, offline queue, branch lock, session guards).

## Files allowed

1. `app/cashier/page.tsx` — full file (chrome + wizard presentation)
2. `app/cashier/dashboard-sections.tsx` — checklist / IT status / ticket modal chrome
3. `app/components/locale-toggle.tsx` — shared; raise touch targets (≥44px) for mobile cashier
4. `app/globals.css` — optional small cashier/wizard motion utilities only
5. **`app/lib/i18n.ts` — FORBIDDEN to regenerate.** If you need a new string, add **at most 1–3 new keys** by outputting a tiny file `briefs/CASHIER_UX_I18N_KEYS.md` listing key + ar + en — do **not** rewrite the dictionary. CUROK will insert them. Prefer reusing existing keys.

## Design goals (skill — cashier)

- **Speed & clarity** for branch staff on mobile.
- **Hierarchy:** header (branch + actions) → optional checklist/IT → **closing wizard is the primary job** (do not bury it).
- Wizard title should be `h2` if header already has `h1` (a11y).
- **Shortage/excess** block stays high-contrast and impossible to miss (emerald excess / rose shortage).
- Touch targets ≥ ~44px on primary actions (logout, ticket, next/save, tabs/steps).
- Slate + emerald + amber + rose only. No purple, no glow stacks, no dark-mode default.
- 2–3 intentional motions max (e.g. step indicator, modal open) with `motion-safe` / reduced-motion care.
- Match login polish language: restrained shadows, `min-h-11`, focus-visible rings, logical `pe-`/`end-` props.
- Keep bilingual `t(locale,…)`, locale restore-on-unmount, `hasTranslation` error path.

## Keep behavior identical

- Session require, logout, ticket modal createTicket, checklist localStorage keys
- All AI/save/duplicate/parse/monetary logic and state
- Routes and API calls unchanged

## Output

```
===FILE: path===
<entire file>
===ENDFILE===
```

End with `END_CASHIER_UX`. No markdown fences. No commentary.
