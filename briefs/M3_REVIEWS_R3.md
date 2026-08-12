# M3 Round 3 (FINAL) — Reviewer verdicts + escalation

Artifact: `briefs/M3_STAGED_R3/` — staged, **not applied**.

```
Reviewer: Claude          Reviewer: Codex
Verdict: Request changes  Verdict: Request changes
Severity: Major           Severity: Major
                          Agreement Status: Agrees with previous reviewer
```

**Round 3 of a maximum 3 is exhausted without the required Approve from both.
Per the Constitution this halts and escalates to the user.**

## Progress across the three rounds

| Item | R1 | R2 | R3 |
|---|---|---|---|
| C1 bucket `closing-images` + path prefixes | broken | fixed | fixed |
| M1 persist object path, no `getPublicUrl` | broken | fixed | fixed |
| M2 duplicate guard checks `error` + local fallback | broken | fixed | fixed |
| M3 failed insert no longer shows success | broken | fixed | fixed |
| M4 audit-log `error` observed | broken | fixed | fixed |
| M5 image-queue failures surfaced | broken | fixed | fixed |
| M6 AI request versioning (race-free) | broken | fixed | fixed |
| M7 `Asia/Riyadh` business date | broken | fixed | fixed |
| M8 / B1 localized money parsing | broken | **worse** | **fixed — 10/10 verified by execution** |
| B2 decimal point typeable | n/a | broken | fixed |
| B3 offline save with photo attached | n/a | broken | fixed |
| B4 clearing resets AI values | n/a | broken | partial |
| B5 signed-URL resolver | n/a | broken | partial (new paths fixed; legacy rows Minor) |

B1 verified empirically, not by reading: `briefs/test_parse_localized.js`
against `briefs/M3_STAGED_R3/app/cashier/page.tsx` returns 10/10, up from 6/10.

Storage verified live: `closing-images` accepts an anon upload (200), signs a
read (200), and refuses public reads (400).

## Outstanding objections (both reviewers, blocking)

### O1 — `cashActualHanded` has two unsynchronized buffers (Claude, confirmed by Codex)

`app/cashier/page.tsx:236, 329-347, 364-385, 531-556, 614-625, 896-905`.
B2 gave six of seven monetary fields a single source of truth in `rawValues`,
but the manual-cash input still renders `manualActualCashRaw`, while the AI
prefill, `fields.cashActualHanded` and `rawValues.cashActualHanded` write the
other. B4's new clearing resets `fields`/`rawValues` and never
`manualActualCashRaw`, so they actively diverge.

Consequence traced by Claude and confirmed by Codex: the screen can show a
**false −520.50 ر.س shortage** when the true figure is −70.50, and the row is
persisted with `reviewed_data.cashActualHanded = 0` while the box displays 450
and `manual_actual_cash = 450` — a record whose own fields do not reconcile.

**Agreed remedy (a):** delete `manualActualCashRaw`; bind the manual input to
`rawValues.cashActualHanded`, with `useManualCash` controlling only the label and
whether `manual_actual_cash` is persisted. Codex explicitly rejects remedy (b) as
insufficient because it does not prevent divergence immediately after AI prefill.

### O2 — repeated analysis orphans stale AI values (Codex only; Claude missed)

`app/cashier/page.tsx:528-556`. A second analysis replaces `aiExtractedData` and
clears modification metadata, but only overwrites keys present in the newest
response. A key extracted by the first run and absent from the second keeps its
old value in both buffers with no AI badge; later clearing cannot identify it,
and it is persisted on save.

**Remedy:** reconcile against the previous extraction — clear prior AI-origin
keys absent from the new result in both buffers, while preserving genuinely
manual fields.

## Non-blocking follow-ups

- Legacy M2 rows hold absolute `getPublicUrl` strings that 400 against the now-private bucket; the resolver returns them unchanged (`closings.ts:187-193`). No reader exists until M4.
- No unmount cleanup aborts an in-flight analyze request (`page.tsx:266-268, 492-579`).
- Nothing drains `QUEUE_KEY` / `PENDING_UPLOADS_KEY`.
- An AI-extracted `0` renders as an empty box carrying an «ذكاء اصطناعي» badge (`page.tsx:552`).
- Unparseable text stays on screen while the field silently becomes 0 (`page.tsx:465-469`).

## Decision required from the user

Both blockers are small and precisely specified. Options: authorize a narrow
round 4 scoped to O1+O2 only (waiving the 3-round cap); adopt R3 under a recorded
waiver as was done for M2; or halt M3.
