# M3 Revision Brief — Round 2 of 3

**Both reviewers returned `Request changes` / `Critical`. They agree; no split verdict.**
Your R1 output is rejected for adoption. Fix every Critical and Major below and resubmit.

## Output format — unchanged from R1

Return the **complete final contents** of every file you touch:

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

No markdown fences. No diffs. No ellipses or "unchanged" placeholders.
End the whole response with `END_M3` on its own line.

Emit all four files again, even ones needing only small edits:
`app/api/analyze-closing-image/route.ts`, `app/cashier/page.tsx`,
`app/lib/closings.ts`, `supabase/migrations/004_ai_extraction.sql`.

## What you got right — keep all of it, do not regress

Verified correct by Claude: lazy `getSupabase()` (no module-scope client); no
`NEXT_PUBLIC_` for GLM; API key never echoed; correct vision model with
`temperature: 0`, `max_tokens: 2048` and the mandatory
`thinking: { type: "disabled" }`; `runtime = "nodejs"`; the 60s `AbortController`
with `clearTimeout` in `finally`; `shortageOrExcess` computed client-side only;
branch lock + `cashier_selected_branch` session preserved; RTL and `ر.س`
preserved; manual entry still works when AI fails; migration 004 idempotent and
column names matching what the client writes; no new npm dependencies.

Rewriting `app/lib/closings.ts` was accepted as in-scope. The problem is that the
rewrite **discarded M2's hardening** instead of extending it.

---

## CRITICAL — must fix

### C1. Uploads target buckets that do not exist
`app/lib/closings.ts:10-11` defines `Z_REPORT_BUCKET = "z-reports"` and
`PROOF_BUCKET = "payment-proofs"` (used at 216, 235). **Neither exists.** The only
bucket is `closing-images`, created private by
`supabase/migrations/003_storage_closing_images.sql`, whose RLS policies are all
scoped to `bucket_id = 'closing-images'`.

Every upload would fail with `Bucket not found`, so `z_report_image_url` and
`payment_proof_image_urls` would always be null and every cashier would see the
failure warning. This is a regression of working M2 behaviour.

**Fix:** upload both kinds to `closing-images`, separated by path prefix —
`${branchId}/z-report/${file}` and `${branchId}/proofs/${file}`.
Do not create new buckets.

---

## MAJOR — all block approval

### M1. Private bucket + `getPublicUrl` = permanently dead URLs
`app/lib/closings.ts:153-156`. The bucket is `public = false`. `getPublicUrl`
never errors — it just formats a string — so you would persist a URL that returns
400 forever, undetected.

**Fix (both reviewers, Codex's form is stricter and is the one to implement):**
persist the **storage object path**, not a URL, and generate a checked
short-lived `createSignedUrl(path, ttl)` at read time. A stored signed URL also
dies at expiry, so do not store one. If signing/upload fails, treat it as an
upload failure: warn in Arabic and queue.

### M2. Duplicate guard swallows errors and lost its offline fallback
`app/lib/closings.ts:105-122`. Line 112 destructures only `{ data }` and discards
`error`; the `catch` returns `false`; line 109 returns `false` when Supabase is
unconfigured. A PostgREST error, RLS denial or network failure therefore all
report "no duplicate" and the cashier is never asked to confirm.

The code you replaced did the opposite (`app/lib/closings.ts:61-78`): it trusted
the result only when `!error`, and fell back to the
`closing_${branchId}_${businessDate}` localStorage key.

**Fix:** destructure `{ data, error }`. On `error`, on exception, or when
Supabase is unconfigured, fall through to the local check — inspect **both** the
legacy `closing_${branchId}_${businessDate}` key **and** the queued closings.
Write that key on every save, both Supabase-successful and queued.

### M3. Failed insert renders the success screen
`app/lib/closings.ts:269-287` turns an insert error into
`source: "local-queued"`; `app/cashier/page.tsx:354-357` then sets `closingId`
and step 3 renders «تم إنشاء الإقفال» with a closing number for a row the
database rejected.

Codex's refinement: queueing is not *inherently* false success — it is false
**here** because `writeQueue` (`closings.ts:74-79`) silently ignores its own
persistence failure and **no code anywhere ever drains the queue**.

**Fix:** on insert error, throw the Arabic error as M2 did
(`app/lib/closings.ts:155-160`) so `saveError` shows and the cashier stays on
step 2. Reserve `local-queued` for the genuinely-offline branch, and only when
the queue write is confirmed persisted. Remove the «سيُعاد الرفع لاحقًا» promise
unless you also implement the drain.

### M4. Audit-log errors are unobservable
`app/lib/closings.ts:310-315` wraps the insert in `try/catch` and never inspects
the returned `error`. supabase-js **resolves** with `{ data, error }` and does not
reject, converting network failures into `error` objects too — so the `catch` and
its Arabic warning can never execute. In an auditability product, both required
rows can vanish with no signal.

**Fix:** `const { error: auditError } = await supabase.from(...).insert(logs);`
and push the Arabic warning when set. Keep it non-fatal.

### M5. Pending-image queue loses images silently
`app/lib/closings.ts:91-103`. `writePendingUploads` swallows every
`localStorage.setItem` failure and `pushPendingUpload` returns `void`, so callers
(222-227, 243-248) cannot tell whether the image survived. You queue the full data
URL: a 10 MB image is ~13 MB of base64, far past the ~5 MB localStorage quota, so
`QuotaExceededError` is the **expected** case — and it is discarded while the UI
says «سيُعاد المحاولة لاحقًا». This is the same silent image loss M3 was asked to
fix, moved one layer down.

**Fix:** return a success boolean from both functions and emit a **distinct**
Arabic warning when the queue write fails, telling the cashier the image was not
retained and must be re-uploaded.

### M6. Stale AI responses can poison the next closing (Codex — new)
`app/cashier/page.tsx:169-198, 228-233, 245-304`. AI requests are neither
cancelled nor versioned. An in-flight request can resolve **after** the image,
branch, or closing has changed and populate the new closing with the old
extraction. Choosing a different image also leaves the previous AI values and
their provenance badges intact.

**Fix:** abort superseded requests via `AbortController` and/or a monotonically
increasing request id, ignore responses that are no longer current, and clear
extraction state (`aiExtractedData`, `manuallyModifiedFields`, provenance badges)
whenever the image, branch, or closing changes. Guard against double-submit.

### M7. Business date is computed in UTC, not Saudi time (Codex — new)
`app/cashier/page.tsx:56-58`. Saudi Arabia is UTC+3, so
`new Date().toISOString().slice(0,10)` returns **yesterday** between 00:00 and
03:00 local — attributing a closing to the wrong business day, in a financial
audit product, precisely during a late-night close.

**Fix:** derive the default business date explicitly in the `Asia/Riyadh`
timezone.

### M8. Localized number input is mis-parsed (Codex — new)
`app/cashier/page.tsx:138-141, 206-223, 340-343, 607-613, 780-785` uses
`parseFloat` without normalizing Arabic-Indic digits or separators. `١٢٣٫٥٠`
fails outright and `1,234.50` silently becomes `1` — a catastrophic figure in a
cash-reconciliation system.

**Fix:** normalize Arabic-Indic digits (٠-٩) and locale/thousands separators
before parsing, and validate monetary precision before saving.

---

## MINOR — fix while you are in the code (non-blocking)

- `route.ts:148`: normalize `GLM_BASE_URL` with `.replace(/\/$/, "")`; a trailing slash yields `//chat/completions`.
- `route.ts:177-178, 214`: stop returning `upstreamStatus`, `upstreamPreview`, `rawPreview` to the browser. Log server-side with `console.error`; the documented response shape is `{ fields, finishReason, model }` plus an Arabic error.
- `page.tsx:278`: replace `(next as Record<string, number>)[key as string] = v;` with a narrowed `next[key] = v` (`key: keyof FinancialFields`); the cast risks TS2352 under strict.
- `route.ts:112, 128`: the 415 guard can never fire for bare-base64 input because `mime` is hardcoded. `route.ts:74-79`: `Buffer.from(x, "base64")` never throws, so the fallback is dead code.
- `page.tsx:606-613`: the manual-cash override bypasses `setField`, so overriding an AI-extracted `cashActualHanded` is not recorded in `manuallyModifiedFields`.
- `closings.ts:132-135`: when `dataUrlToBytes` returns `null` the image vanishes with no warning and no queue entry. Warn there too.

## Accepted, no action

Writing the `ai_extracted` audit row at submit time rather than extraction time
is correct — `daily_closing_audit_logs.closing_id` has a foreign key to
`daily_closings(id)`, which does not exist yet at extraction time.

## Constraints (unchanged)

`npm run build` must stay green. TypeScript strict. Arabic RTL, SAR as `ر.س`.
Reuse `FinancialFields`, `computeShortageOrExcess`, `EMPTY_FINANCIAL_FIELDS` from
`app/types`. Lazy `getSupabase()` only. No new dependencies. No secrets. Do not
touch `.gitignore`, `public/`, or `briefs/`.
