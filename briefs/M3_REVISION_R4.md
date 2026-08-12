# M3 Revision Brief — Round 4 (NARROW, user-authorized beyond the 3-round cap)

Round 3 reached the Constitution's 3-round limit with two blockers outstanding.
The user authorized **one additional narrowly-scoped round**. This is a waiver of
the round cap, **not** of the defects.

## Scope discipline — read this first

**Change ONLY what O1 and O2 below require, plus the listed Minors.**

Round 3 is otherwise accepted. Eleven of thirteen issues raised across rounds 1-3
are closed and verified. Do not refactor, restructure, rename, or "improve"
anything else. Every unnecessary edit risks re-opening a fixed item and will be
rejected. If you are unsure whether something is in scope, leave it alone.

## Output format — unchanged

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

No markdown fences anywhere — round 3 emitted a stray trailing ``` after
`END_M3`; do not repeat that. No diffs, no ellipses. End with `END_M3`.

Emit all four files again: `app/api/analyze-closing-image/route.ts`,
`app/cashier/page.tsx`, `app/lib/closings.ts`,
`supabase/migrations/004_ai_extraction.sql`. Only `page.tsx` should differ
materially; the other three are re-emitted unchanged unless a Minor below
touches them.

## Verified fixed in round 3 — do not regress

B1 money parser (**executed, 10/10 cases pass**, including `1,234.50`→1234.5,
`١٢٣٫٥٠`→123.5, `١٬٢٣٤٫٥٠`→1234.5, `12,5`→12.5), B2 decimal entry via the
`rawValues` buffer, B3 offline save with a photo attached, C1 bucket + path
prefixes, M2 duplicate guard, M3 insert-failure throw, M4 audit `error` check,
M5 queue booleans, M6 request versioning (confirmed race-free by Codex — do not
touch), M7 `Asia/Riyadh` date, B5 resolver for new object paths.

Live environment confirmed: `closing-images` accepts an anon upload (200), signs
a read (200), refuses public reads (400).

---

## O1 — BLOCKER. `cashActualHanded` has two unsynchronized buffers

Raised by Claude, independently confirmed by Codex.

`app/cashier/page.tsx:236, 329-347, 364-385, 531-556, 614-625, 896-905`.

B2 gave six of the seven monetary fields a single source of truth in
`rawValues`. `cashActualHanded` still has two: the manual-cash input at
`:896-905` renders `manualActualCashRaw` (`:236`, `:899`), while the AI prefill
(`:531-544`), `fields.cashActualHanded` and `rawValues.cashActualHanded` all
write the other. B4's clearing at `:364-376` resets `fields` and `rawValues` but
never `manualActualCashRaw`, so the two actively diverge.

Traced consequence, through ordinary use of two shipped M3 features:

1. Tick «إدخال النقدية الفعلية يدويًا», type `450`. `aiExtractedData` is still
   empty, so `cashActualHanded` is **not** marked manually modified.
2. Run «تحليل صورة تقرير Z». The model returns `cashActualHanded: 480`,
   `cashSystem: 520`. `fields.cashActualHanded` becomes 480; the box still shows 450.
3. Edit «النقدية حسب النظام» to `520.50` — now genuinely manually modified.
4. Change the business date, firing `clearExtractionState`. `cashActualHanded` is
   an AI key and is not preserved, so `fields.cashActualHanded` becomes 0 while
   `manualActualCashRaw` stays `"450"`.
5. Line `:371` sets `shortageOrExcess = computeShortageOrExcess(0, 520.50) = -520.50`.
   The effect at `:339-347` cannot correct it: its deps are
   `[effectiveActualCash, fields.cashSystem]`, and neither changed.
6. **Screen shows a −520.50 ر.س shortage. The true value is −70.50.**
7. On save, `:614-620` spreads `fields`, so the row stores
   `reviewed_data.cashActualHanded = 0` with `manual_actual_cash = 450` and
   `shortageOrExcess = -70.50` — a record whose own fields do not reconcile
   (0 − 520.50 ≠ −70.50) and whose cash figure is not what the cashier saw.

**Required fix — remedy (a). Both reviewers agree; Codex explicitly rejected the
alternative as insufficient because it does not prevent divergence immediately
after the AI prefill at step 2.**

Delete `manualActualCashRaw` entirely. Bind the manual-cash input to
`rawValues.cashActualHanded`, so there is exactly one buffer per field.
`useManualCash` must then control **only**:
- the label/affordance shown, and
- whether `manual_actual_cash` is persisted on save.

It must no longer control which buffer is read. Ensure `effectiveActualCash`,
`shortageOrExcess`, and the saved `reviewed_data.cashActualHanded` all derive
from that single buffer, so what the cashier sees is always what is stored.

Also drop the now-redundant `shortageOrExcess` assignment at `:371-374` so the
effect at `:339-347` remains the single owner of that value.

## O2 — BLOCKER. Repeated analysis orphans stale AI values

Raised by Codex.

`app/cashier/page.tsx:528-556`. A second analysis replaces `aiExtractedData` and
clears modification metadata, but only overwrites keys present in the newest
response. A key extracted by the **first** run and absent from the **second**
keeps its old value in both `fields` and `rawValues`, with no AI badge. Later
clearing at `:359-385` cannot identify it as AI-origin, and it is persisted on
save at `:614-641`.

**Required fix:** reconcile against the previous extraction. When a new result
arrives, clear any key that was AI-origin in the prior extraction but is absent
from the new one — in **both** `fields` and `rawValues` — while preserving fields
the cashier genuinely modified by hand.

---

## Minors — fix only these, nothing else

- `app/cashier/page.tsx:266-268, 492-579`: no unmount cleanup aborts an in-flight analyze request. Add effect cleanup that aborts the controller and invalidates the request version on unmount.
- `app/cashier/page.tsx:552`: an AI-extracted `0` renders as an empty box still carrying the «ذكاء اصطناعي» badge. Render `0` as `"0"`.
- `app/cashier/page.tsx:465-469`: unparseable text stays on screen while the field silently becomes 0. Show an Arabic validation hint instead of silently zeroing.
- `app/lib/closings.ts:187-193`: the resolver returns a legacy absolute `getPublicUrl` string unchanged; those now 400 because the bucket is private. Where the stored value contains `/closing-images/`, split on it and sign the remainder; otherwise return `null` rather than a known-dead URL.

## Explicitly OUT of scope for this round

Do not implement a queue drain for `QUEUE_KEY` / `PENDING_UPLOADS_KEY` — tracked
as follow-up. Do not build any read/viewer UI (that is M4). Do not touch the
auditor page, `.gitignore`, `public/`, or `briefs/`.

## Constraints (unchanged)

`npm run build` green. TypeScript strict. Arabic RTL, SAR as `ر.س`. Reuse
`FinancialFields`, `computeShortageOrExcess`, `EMPTY_FINANCIAL_FIELDS` from
`app/types`. Lazy `getSupabase()` only. No new dependencies. No secrets.

Your `parseLocalizedNumber` will be re-executed against all ten money cases. It
must still return 10/10.
