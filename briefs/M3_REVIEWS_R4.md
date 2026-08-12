# M3 Round 4 — Reviewer verdicts (SPLIT — escalation required)

Artifact: `briefs/M3_STAGED_R4/` — staged, **not applied**.

```
Reviewer: Claude              Reviewer: Codex
Verdict: Approve              Verdict: Request changes
Severity: Minor               Severity: Major
                              Agreement Status: Disagrees — see notes
```

Per the Constitution, a split verdict escalates to the user with both positions
summarized. CUROK must not pick a side.

## What both reviewers agree on

- **O1 FIXED.** `manualActualCashRaw` is gone. Both render branches bind
  `rawValues.cashActualHanded` (`page.tsx:953-969`); `useManualCash` controls only
  the label and whether `manual_actual_cash` persists (`:675`); the round-3
  divergence that produced a false −520.50 ر.س shortage **cannot recur**.
- **O2 FIXED.** Stale AI keys absent from a re-analysis are cleared in both
  `fields` and `rawValues` while hand-modified values are preserved (`:560-605`).
- **No scope creep.** `route.ts` and `004_ai_extraction.sql` are byte-identical to
  the accepted R3 baseline. `closings.ts` +12 lines confined to the resolver
  (`:176-206`). `page.tsx` +68 lines all traceable to brief items.
- **B1 not regressed** — parser re-executed, 10/10 money cases pass.
- No new hook, closure, re-render, strict-TypeScript, dependency or regression
  defects beyond the disputed item.

## The single disagreement

`page.tsx:466-494, 641-693, 1027-1033`. Unparseable text in a monetary field
sets the numeric value to `0`, and `handleSave` neither consults `parseErrors`
nor disables the save button. A cashier can therefore submit while a field
visibly reads «قيمة غير صحيحة», and `reviewed_data` stores `0`.

- **Claude — Minor.** The field is flagged in red, so this is no longer the
  silent zeroing the brief complained about. The brief's Minor asked only for the
  validation hint, which was delivered. Track the save-block as follow-up.
- **Codex — Major.** In a financial audit system, persisting `0` for a field the
  cashier never validly entered is direct data corruption regardless of styling.
  Blocks approval.

Agreed remedy either way: block `handleSave` (or disable the submit button)
while `parseErrors.size > 0`, with a save-level Arabic validation message.

## Remaining agreed Minors (non-blocking, both reviewers)

- `parseErrors` is not cleared by the AI prefill or `clearExtractionState`, so a field can keep a stale red border after being correctly overwritten (`:568-605`).
- `"-"` and `"."` trigger the invalid hint mid-typing (`:90-111, :481-494`).
- Each re-analysis resets `manuallyModifiedFields`, so a preserved hand-edited key loses its «معدّل يدويًا» badge and its audit metadata on save (`:560-569`).

## Decision required from the user

Options: authorize a round 5 scoped to the save-block only; adopt R4 now under a
recorded waiver (Claude's position); or halt.
