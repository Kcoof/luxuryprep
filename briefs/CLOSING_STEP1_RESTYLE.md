# Implementation Brief — Daily closing Step 1 restyle (Pulse-like) + Mada/Visa/Cash

**Constitution:** Model Constitution — GLM authors  
**Brand:** luxuryprep (never Pulse Cafe)  
**Skill:** luxuryprep-ux-ui

## Goal

When the cashier starts daily closing, **Step 1** should look near the provided Branch Health screenshot:

### Layout
- Green instruction banner at top of wizard card (short bilingual tip)
- **Two columns on md+** (stack on mobile):
  - **Col A — Basic report data (1):** locked branch badge, business date, **optional actual cash handed (SAR)** field
  - **Col B — Uploads:**
    - **(2) Foodics Z-report** — large dashed dropzone + browse
    - **(3) Payment proofs** — **three separate slots**: **Mada** (emerald), **Cash deposit/receipt** (amber), **Visa** (blue). One image each. Optional.
- Primary CTA full width: “Extract / analyze & continue to confirmation” → run AI if image present then go step 2, **or** at minimum go to step 2 and keep analyze on step 2. Prefer: CTA goes to step 2; if z-report present, optionally auto-trigger analyze (or keep analyze button on step 2). Simplest safe: CTA = next to step 2 (existing analyze stays on step 2). Label CTA like the reference.

### Data wiring (no DB migration)
Replace generic multi `proofImages: string[]` picker with:
```
madaProof: string | null
cashProof: string | null  
visaProof: string | null
```
On save, pass `paymentProofImageUrls: [mada, cash, visa].filter(Boolean)` (stable order: mada, cash, visa). Keep `zReportImage` as today.

Preserve `useManualCash` / `rawValues.cashActualHanded` — show optional cash amount on step 1 (same buffer step 2 already uses).

### Do not change
- AI route, saveClosing, duplicate guard, offline queue logic beyond proof array assembly
- Step 2/3 field math

### Files
1. `app/cashier/page.tsx` — full file (step 1 UI + proof state)
2. Optional small presentational helper in `app/cashier/closing-upload-cards.tsx` if cleaner
3. **Do NOT regenerate** `app/lib/i18n.ts` — list new keys in `briefs/CLOSING_STEP1_I18N_KEYS.md`

### Output
`===FILE===` / `===ENDFILE===` full bodies. End `END_CLOSING_STEP1`.
