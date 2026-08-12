# Implementation Brief — M3 GLM analyze-closing-image + confirmation UI

**Constitution:** Model Constitution
**Author:** GLM only
**Review after:** Claude → Codex

## Output format (CHANGED from M1/M2 — read carefully)

M1 and M2 each burned multiple rounds on malformed unified diffs (wrong hunk
line counts, `git apply` "corrupt patch"). **Do not output a diff.**

Return the **complete final contents** of every file you touch, each wrapped
exactly like this, with no markdown fences anywhere:

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

Finish the whole response with `END_M3` on its own line.
Full contents only — no ellipses, no "unchanged" placeholders.

## Verified facts you MUST build on (measured 2026-08-12, not assumptions)

- `GLM-5.2` **rejects images**: `400 code 1210 — messages.content.type is invalid, allowed values: ['text']`. Never send an image to `GLM_MODEL`.
- Vision model is **`process.env.GLM_VISION_MODEL`** (currently `glm-4.6v`). Already present in `.sec` / `.sec.example`.
- **`thinking: { type: "disabled" }` is mandatory** in the request body. Without it the model spends the entire `max_tokens` budget reasoning and returns **empty content** with `finish_reason: "length"`. With it: `finish=stop`, ~111 completion tokens, ~6s.
- Working request shape (verified in `briefs/probe_glm_ocr.js`):
  `POST {GLM_BASE_URL}/chat/completions`, body `{ model, temperature: 0, max_tokens: 2048, thinking: { type: "disabled" }, messages: [{ role: "user", content: [ { type: "text", text: ... }, { type: "image_url", image_url: { url: dataUrl } } ] }] }`
- A ~380px-wide Arabic Z-report costs **~4.2k prompt tokens**.
- The model returns `branchCode` as `null` — ignore it, branch comes from the locked session.

## Scope (M3 only)

### 1. `app/api/analyze-closing-image/route.ts` (new)

- `export const runtime = "nodejs";` — must not run on edge.
- `POST` accepts JSON `{ imageBase64 }` (a `data:image/...;base64,...` URL or bare base64).
- Server-only secrets. **Never** reference `NEXT_PUBLIC_` for GLM. If `GLM_API_KEY` / `GLM_BASE_URL` / `GLM_VISION_MODEL` are missing, return `503` with an Arabic message — do not throw at module scope (M1 was rejected for module-scope Supabase init; same rule applies here).
- Reject payloads over ~10 MB decoded with `413`, and non-image mime with `415`.
- Prompt the model to return ONLY raw JSON for these keys, all nullable:
  `grossSales`, `netSales`, `cashSystem`, `spanSystem`, `deliveryAppsSystem`, `reversedTransactions`, `cashActualHanded`.
  Instruct it to strip thousands separators and use dot decimals.
- Parse defensively: strip a ``` or ```json fence if present, `JSON.parse` in a try/catch, and if the content is empty or unparseable return `502` with an Arabic message plus the `finish_reason`. Empty content is a real, observed failure mode.
- Coerce every value with `Number()`; drop anything non-finite rather than emitting `NaN`. Do not invent values.
- Do **not** compute `shortageOrExcess` server-side; the client owns it via `computeShortageOrExcess`.
- Respond `{ fields, finishReason, model }`. Never echo the API key or the full image back.
- Add a timeout (`AbortController`, ~60s) so a hung upstream cannot hang the route.

### 2. `app/cashier/page.tsx` (modify — return full file)

Keep every existing M2 behaviour: branch lock + `cashier_selected_branch`
localStorage session, duplicate branch+date guard, offline queue, Arabic RTL,
`ر.س` currency, the 3-step wizard, and the `close-{timestamp}` id scheme.

Add to **step 2**:

- A «تحليل بالذكاء الاصطناعي» button, enabled only when a Z-report image exists.
- Calls `/api/analyze-closing-image` with the image; shows an Arabic loading state; the button must be disabled while in flight.
- On success, prefill the number inputs and keep the returned values in `aiExtractedData`. Recompute `shortageOrExcess` locally.
- The cashier can still edit every field. Any field the cashier changes after extraction gets recorded in `manuallyModifiedFields` (typed `(keyof FinancialFields)[]`).
- Show a small Arabic badge on fields that came from AI versus fields edited by hand.
- On failure, show the Arabic error and **leave manual entry fully working** — AI extraction is an accelerator, never a hard dependency.

Also fix this **M2 waived defect** (in scope now because M3 depends on the image existing):

- When a Supabase Storage upload fails, the image is currently dropped silently. Instead keep it in the local offline queue and surface an Arabic warning. Never write a `data:` base64 URL into the `z_report_image_url` / `payment_proof_image_urls` columns — those are URL columns.

Persist `aiExtractedData` and `manuallyModifiedFields` on insert into `daily_closings`.

Write a `daily_closing_audit_logs` row with `actor_role: "ai"`, `action: "ai_extracted"` when extraction succeeds, and `actor_role: "cashier"`, `action: "cashier_confirmed"` on submit.

### 3. `supabase/migrations/004_ai_extraction.sql` (new)

`daily_closings` currently has no column for AI output. Add, idempotently
(`add column if not exists`), matching the existing migration style and header
comment format used in `002_daily_closings.sql`:

- `ai_extracted_data jsonb`
- `ai_confidence jsonb`
- `manually_modified_fields text[]`

Do not re-create the table and do not drop anything.

### 4. `.sec.example`

Already contains `GLM_VISION_MODEL` — leave it alone.

## Out of scope

- Auditor tabs / approvals / gated reports (M4).
- Supabase Auth roles.
- Do not touch `.gitignore`, `public/`, or `briefs/`.
- Do not add dependencies. No secrets in any file.

## Constraints

- `npm run build` must stay green. TypeScript strict — no `any` leaking into exported signatures.
- Arabic RTL throughout; SAR shown as `ر.س`.
- Reuse `FinancialFields`, `computeShortageOrExcess`, `EMPTY_FINANCIAL_FIELDS` from `app/types`. Do not redefine them.
- Use the existing lazy `getSupabase()` from `app/lib/supabase.ts`; never construct a client at module scope.
