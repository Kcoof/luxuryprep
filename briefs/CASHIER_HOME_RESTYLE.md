# Implementation Brief — Cashier home restyle (Pulse-like layout, luxuryprep)

**Constitution:** Model Constitution — GLM authors  
**Skill:** luxuryprep-ux-ui  
**User:** Start — make cashier look near the Branch Health / Pulse-style screenshot (green header + 2×2 status cards + bottom closing card). **Brand stays luxuryprep** — never Pulse Cafe / coffee logo.

## Visual target (adapt, don’t clone brand)

1. **Full-width emerald/forest header** (`bg-emerald-800` or `emerald-900`):
   - Greeting (صباح الخير / Good morning — time-of-day OK)
   - Branch name + id
   - Date + time chip
   - luxuryprep wordmark (LTR) + Calculator/Store icon (not coffee)
   - Logout + LocaleToggle (readable on green — white/light controls)
2. **Centered question** under header: “كيف حالة الأجهزة والأنظمة في فرعك اليوم؟” / EN equivalent
3. **2×2 status cards** (white, rounded-xl, soft shadow, colored start border + icon circle):
   - Card A: Pre-close checklist progress (tap expands checklist or opens details)
   - Card B: Foodics (demo OK from existing ItStatus)
   - Card C: Mada (demo)
   - Card D: IT / printer or “Open IT ticket” (opens existing ticket modal)
4. **Full-width primary card** at bottom of home: Daily financial closing (dollar/calculator icon in emerald circle) — CTA scrolls to / expands the existing 3-step wizard
5. **Wizard** remains below with **unchanged business logic** (AI, save, duplicate, etc.)

## Files

1. `app/cashier/page.tsx` — shell/layout (full file)
2. `app/cashier/dashboard-sections.tsx` — refactor checklist/IT into card-friendly exports used by home grid; keep ticket modal + localStorage checklist keys
3. **Do NOT regenerate** `app/lib/i18n.ts`. Put new keys only in `briefs/CASHIER_HOME_I18N_KEYS.md` (key + ar + en). CUROK will insert.

## Keep identical

- Session guard, logout, createTicket, checklist storage key format
- All wizard/AI/save/offline logic
- No Firebase, no Pulse branding

## Output

`===FILE: path===` … `===ENDFILE===`  
End `END_CASHIER_HOME`.
