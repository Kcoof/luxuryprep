# M7 Revision Brief — Round 4 (NARROW — F3 only)

Both Claude + Codex still **Request changes (Major)** on F3 only. F1/F2/F4 are accepted as fixed — do not rework them.

**Author:** GLM. `thinking: { type: "disabled" }`.  
**Goal:** Kill `localizeRuntimeMessage` prose regex. Use **stable codes / i18n keys** end-to-end.

## Required design

### A) Analyze API — `app/api/analyze-closing-image/route.ts`
Every error JSON must include a stable `code` that equals an i18n dictionary key, e.g.:

```json
{ "error": "<Arabic fallback string OK>", "code": "wizard.ai.err.badRequest" }
```

Map all current Arabic error returns to codes (add matching keys in i18n):
- bad request / no image / bad image format / unsupported mime / too large
- provider failure / empty extract / parse failure / unexpected
- keep HTTP status codes as today

Client must prefer `code` → `t(locale, code)` and only fall back to `error` string if code missing.

### B) Closings helpers — `app/lib/closings.ts`
Change **warnings** pushed during save/upload to **i18n keys** (not Arabic prose), e.g.:
- `wizard.warn.offlineQueued`
- `wizard.warn.imagesStripped`
- `wizard.warn.zUploadFailed` / `wizard.warn.proofUploadFailed`
- `wizard.warn.zUploadLocalOnly` / `wizard.warn.proofUploadLocalOnly`
- `wizard.warn.zStorageFull` / `wizard.warn.proofStorageFull`
- `wizard.warn.auditLogFailed`

Thrown `Error` messages used by the cashier save path should similarly use keys as `Error.message` **or** a custom property — simplest: `throw new Error("wizard.saveError.storageFull")` where message IS the key, and cashier does `t(locale, err.message)` when `DICTIONARY` has it (export `hasKey` from i18n or try `t` and detect raw-key fallback).

Do **not** break auditor approve/reject flows: if auditor catches Arabic errors today, either keep Arabic for auditor-only throws OR add keys and leave auditor Arabic-only display (raw key would be bad — prefer keep Arabic strings for auditor-only functions `listClosings`/`approve`/`reject` if cashier never shows them). **Cashier-touched paths must be keys.**

### C) Cashier — `app/cashier/page.tsx`
- **Delete** `RUNTIME_MESSAGE_RULES` / `localizeRuntimeMessage`.
- AI catch: parse JSON `code` from `/api/analyze-closing-image` when present → `t(locale, code)`.
- Save errors: if `error.message` is a known i18n key → `t(locale, message)`, else generic `wizard.saveError`.
- Step-3 warnings list: `warnings.map(w => t(locale, w))` (since warnings are keys). Deduplicate offline: if you already show `wizard.offlineNotice` card when `saveSource === local-queued`, do **not** also push the same offline warning into the list (or filter it).

### D) i18n — `app/lib/i18n.ts`
Add AR+EN for every new `wizard.ai.err.*` and `wizard.warn.*` / save error keys used above. Optionally export `hasTranslation(key)`.

## Files to emit (full bodies only)

1. `app/api/analyze-closing-image/route.ts`
2. `app/lib/closings.ts`
3. `app/lib/i18n.ts`
4. `app/cashier/page.tsx`

Do **not** re-emit admin/login/auditor/tickets/migration unless a one-line import is required.

## Output

`===FILE: path===` … `===ENDFILE===` (colon form preferred). End `END_M7`.
