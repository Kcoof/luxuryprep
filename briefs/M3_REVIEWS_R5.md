# M3 Round 5 — Escalation (reviewers unavailable)

Artifact: `briefs/M3_STAGED_R5/` — staged, **not applied**.

## Constitution status

```
Claude: UNAVAILABLE (API usage limit) — retried once, still blocked
Codex:  UNAVAILABLE (API usage limit)
```

Per Model Constitution: reviewer unavailable after one retry → escalate to user.
CUROK must not invent an Approve in their place.

## CUROK read-only verification of S1 (the only blocker this round)

| Check | Result | Evidence |
|---|---|---|
| S1 early-return in `handleSave` | PRESENT | `page.tsx:681-684` — `if (parseErrors.size > 0) { setSaveError("صحّح القيم غير الصحيحة قبل الحفظ."); return; }` |
| S1 save button disabled | PRESENT | `page.tsx:1077` — `disabled={saving \|\| parseErrors.size > 0}` |
| S1 banner | PRESENT | `page.tsx:1061-1064` — «صحّح القيم غير الصحيحة قبل الحفظ» |
| Path to `saveClosing` blocked | TRACE OK | Early return precedes duplicate check and `saveClosing` call; button cannot fire while errors exist |
| B1 parser regression | NONE | Re-executed: **10/10** |
| O1 buffer regression | NONE | `manualActualCashRaw` still absent |
| Scope: route.ts | IDENTICAL to R4 | SHA256 match |
| Scope: closings.ts | IDENTICAL to R4 | SHA256 match |
| Scope: 004 migration | IDENTICAL to R4 | SHA256 match |
| Scope: page.tsx | +47 lines | Only page changed |

Optional Minors appear implemented (incomplete `"-"`/`"."` at `:491-497`;
`parseErrors` cleared on AI path at `:627+`; `manuallyModifiedFields` retained
via `preservedModified` at `:587-590`).

## Decision required from the user

Without Claude + Codex Approve, the Constitution forbids adoption.

Options:
1. **Wait** — retry Claude + Codex reviews when quota recovers (Recommended if you can wait).
2. **Recorded waiver** — waive both reviewers for this narrow round only; CUROK applies R5 byte-for-byte under Answer A transport. Justified because S1 is the single disputed item, the fix is present and traced, and the three non-page files are byte-identical to the R4 baseline Claude already Approved.
3. **Halt** — leave M3 staged, do not apply.
