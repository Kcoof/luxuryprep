# M3 Revision Brief — Round 5 (NARROW, user-authorized — split-verdict resolution)

Round 4 produced a **split verdict**: Claude Approve, Codex Request changes / Major.
The user authorized one additional round scoped to the single disputed item.

## Scope discipline — read this first

**Change ONLY what S1 below requires, plus the three listed Minors if trivial.**

Round 4 is otherwise accepted. O1 and O2 are FIXED and verified. Do not
refactor, restructure, rename, or "improve" anything else. Unnecessary edits
will be rejected.

## Output format — unchanged

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

No markdown fences anywhere. No diffs. No ellipses. End with `END_M3`.

Emit all four files again. Only `app/cashier/page.tsx` should differ
materially. The other three (`route.ts`, `closings.ts`, `004_ai_extraction.sql`)
must be byte-identical to round 4 unless a Minor below touches `closings.ts`
(none do — leave them unchanged).

## Verified fixed in round 4 — do not regress

O1 single buffer for `cashActualHanded` (no `manualActualCashRaw`), O2 stale-AI
reconciliation, B1 money parser (10/10 executed), B2–B5, C1, M2–M7, all
round-4 Minors that were delivered (unmount abort, AI `0` as `"0"`, validation
hint, legacy URL split-and-sign).

---

## S1 — BLOCKER (Codex Major; Claude rated Minor — user sided with Codex)

`app/cashier/page.tsx:466-494, 641-693, 1027-1033`.

Unparseable text in a monetary field sets the numeric value to `0` and shows
«قيمة غير صحيحة» in red, but `handleSave` neither consults `parseErrors` nor
disables the submit button. A cashier can therefore submit while a field is
visibly invalid, and `reviewed_data` stores `0` for a value the cashier never
validly entered.

**Required fix (both reviewers already agree on the remedy):**

1. Block `handleSave` (return early with an Arabic save-level error) while
   `parseErrors.size > 0`.
2. Disable the submit / save button while `parseErrors.size > 0`.
3. Optionally show a short Arabic banner near the button, e.g.
   «صحّح القيم غير الصحيحة قبل الحفظ».

Do not change how parsing works. Do not remove the red-border hint. Only stop
the save path.

---

## Minors — fix only if trivial while you are in the same function(s)

- Clear `parseErrors` for keys overwritten or cleared by AI prefill /
  `clearExtractionState` (`:568-605`, `:386-394`), so a field does not keep a
  stale red border after a correct AI value lands.
- Treat a lone `"-"` or `"."` as incomplete (no error), not invalid, so the hint
  does not flash mid-typing.
- When re-analysis preserves a hand-edited key under O2, retain that key in
  `manuallyModifiedFields` instead of resetting the whole set to `[]`.

If any of these requires a non-trivial redesign, skip it and leave a one-line
`// TODO(follow-up):` comment. Do not expand scope.

## Explicitly OUT of scope

Queue drain, auditor UI, new dependencies, edits to `.gitignore` / `public/` /
`briefs/`, changes to the API route or migration.

## Constraints (unchanged)

`npm run build` green. TypeScript strict. Arabic RTL, SAR as `ر.س`. Reuse
types helpers. Lazy `getSupabase()` only. No secrets.

`parseLocalizedNumber` will be re-executed against all ten money cases and must
still return 10/10.
