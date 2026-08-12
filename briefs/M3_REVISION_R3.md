# M3 Revision Brief — Round 3 of 3 (FINAL)

Both reviewers returned `Request changes` / `Critical` on round 2 and agree.
**This is the last round the Constitution allows.** Anything still blocking after
this escalates to the user. Fix every Critical and Major below.

## Output format — unchanged

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

No markdown fences, no diffs, no ellipses. End with `END_M3`.
Emit all four files again: `app/api/analyze-closing-image/route.ts`,
`app/cashier/page.tsx`, `app/lib/closings.ts`,
`supabase/migrations/004_ai_extraction.sql`.

## Round 2 credit — these are FIXED, do not regress them

C1 bucket (`closing-images` with `${branchId}/z-report` and `${branchId}/proofs`
prefixes), M1 persistence half (object path stored, no `getPublicUrl`), M2
duplicate guard (checks `error`, falls back to legacy key **and** queue, marks on
every save), M3 failed-insert now throws and keeps the cashier on step 2, M4
audit `error` destructured and checked, M5 queue booleans with distinct warnings,
M6 AI request versioning (Codex confirmed the id check and `finally` ordering are
race-free — do not rewrite this), M7 `Asia/Riyadh` business date.

Also confirmed clean: lazy `getSupabase()`, no `NEXT_PUBLIC_` GLM refs,
`thinking: { type: "disabled" }`, `runtime = "nodejs"`, client-side-only
`shortageOrExcess`, branch lock session, RTL + `ر.س`, migration 004 idempotent
with matching column names, `payment_proof_image_urls` written as a valid
`string[]`, no new dependencies, trailing-slash and upstream-preview leaks fixed.

**Live environment note:** the `closing-images` bucket now exists and was tested
end to end — anon upload returns 200, `createSignedUrl` returns 200, and the
public URL returns 400 because the bucket is private. Your persist-path +
sign-on-read approach is correct. Finish it.

---

## B1. CRITICAL — `parseLocalizedNumber` corrupts money

`app/cashier/page.tsx:101-106`. You correctly determine which character is the
decimal separator (lines 69-99), then line 103
(`working.replace(/\./g, "").replace(/,/g, ".")`) runs a **second** normalization
over values already converted to dot-decimal form and deletes the real decimal
point.

I executed your function. Measured, not theorised:

```
"1234"        -> 1234    OK
"1234.50"     -> 1234.5  OK
"1,234.50"    -> 123450  FAIL (x100)
"1.234,50"    -> 1234.5  OK
"1,234"       -> 1234    OK
"12,5"        -> 125     FAIL (x10)
"١٢٣٫٥٠"       -> 12350   FAIL (x100)
"١٬٢٣٤٫٥٠"     -> 123450  FAIL (x100)
"-25.00"      -> -25     OK
"0"           -> 0       OK
```

**Every Arabic-numeral case fails**, in an Arabic-first product. Round 1 produced
`1` — visibly absurd. Round 2 produces `123450` — plausible, so it silently
reaches `reviewed_data`, `manual_actual_cash` and `shortageOrExcess`.

**Fix:** normalize exactly once. Decide the decimal index, strip all other
separators, convert only that one character, e.g.

```
working.slice(0, decimalIdx).replace(/[^\d-]/g, "") + "." +
working.slice(decimalIdx + 1).replace(/\D/g, "")
```

Your implementation must make **all ten cases above** pass. They will be re-run
against your output by `briefs/test_parse_localized.js`.

## B2. MAJOR — the decimal point cannot be typed

`app/cashier/page.tsx:341-351, 741-809, 948-954`. Round 2 changed the seven
monetary inputs to controlled `type="text"` whose displayed value is
`String(parsedNumber)`, recomputed every keystroke. Typing `1234.75` goes
`"1234."` → parses to `1234` → re-renders as `"1234"`, erasing the `.`; the
remaining keystrokes yield `123475`. Cashiers cannot enter halalas at all, and
the saved figure is 100× the intended amount.

Codex confirms; note `manualActualCashRaw` (line 772) already does this correctly.

**Fix:** keep a **raw string buffer per field**, exactly as `manualActualCashRaw`
does. Parse on blur or at save time. Never reformat a field while it has focus.

## B3. MAJOR — offline save fails when a photo is attached

`app/lib/closings.ts:351-361`. The offline branch queues `{ ...input }`, which
still contains the full image data URLs, then throws when `writeQueue` returns
false. A 2-5 MB phone photo is ~2.7-6.7 MB of base64 against a ~5 MB quota —
your own comment at lines 96-98 documents this limit. The cashier is then blocked
on step 2 and **no closing can be recorded offline at all**. M2 had no such
problem because it queued no image data.

Codex's correction to Claude's wording: not literally *always* — a small single
image can fit — but it is the ordinary case with real photos.

**Fix:** never put image bytes in the closing queue payload. On a failed queue
write, retry once with the image data URLs stripped, and emit the distinct Arabic
"image not retained, please re-upload" warning. Throw only if the image-less
write also fails. The closing itself is a few hundred bytes and must never be
lost because of an attachment.

## B4. MAJOR — clearing extraction leaves the AI's numbers behind (Codex, new)

`app/cashier/page.tsx:258-269`, wired at `:271-281` and `:353-360`.
`clearExtractionState` clears AI **metadata** only. The AI-populated values in
`fields` survive a change of image or business date — now stripped of their
provenance badges, so they look like the cashier typed them, and they can be
submitted against a different closing.

**Fix:** when the extraction identity changes (image, branch, business date, or
closing), also reset the AI-origin values in `fields`. Preserve any field the
cashier manually modified; clear the rest back to `EMPTY_FINANCIAL_FIELDS`.

## B5. MAJOR — no signed-URL resolver, and legacy rows are a mixed format (Codex, new)

`app/lib/closings.ts:181-185, 419-423`. You now persist an object **path**, but
no `createSignedUrl` resolver exists anywhere. Worse, rows already written by the
**applied** M2 code contain full public URLs (`app/lib/closings.ts:39-42,143-144`
in the current tree), so the column will hold two incompatible representations
and nothing can read either.

**Fix:** export a checked resolver that, given a stored value, returns a
short-lived signed URL — detecting whether the stored value is a legacy absolute
URL (starts with `http`) or a new object path, and handling both. Check
`createSignedUrl`'s `error`; never return an unchecked string. Do not persist the
signed URL.

---

## Minors — fix while you are in the code (non-blocking)

- `closings.ts:226-227, 287-288, 316-317`: warnings still promise «سيُعاد الرفع لاحقًا» while nothing drains `PENDING_UPLOADS_KEY`. Reword to say the image is stored on this device only and must be re-uploaded.
- `closings.ts:189-195`: `UploadOutcome.retained` is computed on all six paths and never read. Use it to drive warning severity, or drop it.
- `closings.ts:203-229`: a malformed data URL that `dataUrlToBytes` rejected is still pushed to the queue; it can never decode later, so it just consumes quota. Do not queue it.
- `closings.ts:50`: `image/gif` is accepted, but migration 003 restricts `allowed_mime_types` to jpeg/png/webp/heic, so every GIF fails. Drop gif, and align the file input's `accept`.
- `route.ts:111-132`: the 415 branch is reachable for non-image data URLs; only bare base64 bypasses MIME validation. Tighten or document.

## Constraints (unchanged)

`npm run build` green. TypeScript strict. Arabic RTL, SAR as `ر.س`. Reuse
`FinancialFields`, `computeShortageOrExcess`, `EMPTY_FINANCIAL_FIELDS` from
`app/types`. Lazy `getSupabase()` only. No new dependencies. No secrets. Do not
touch `.gitignore`, `public/`, or `briefs/`.
