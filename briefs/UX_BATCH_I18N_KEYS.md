# UX batch (2026-08-16) — i18n ledger

`app/lib/i18n.ts` was **intentionally NOT regenerated**.

## Cashier (`app/cashier/page.tsx`) + Admin (`app/admin/page.tsx`)

No new keys. All changed surfaces reuse existing dictionary keys
(`wizard.*`, `common.*`, `admin.*`, `ticket.*`, `cashier.*`, `login.role.*`).

## Auditor (`app/auditor/page.tsx`)

The auditor portal is Arabic-only this round (hardcoded strings by design,
`dir="rtl" lang="ar"` pinned). The polish pass introduced the following
NEW user-visible Arabic strings. Keys below are reserved for a future
auditor i18n migration — add them to `app/lib/i18n.ts` when that pass
happens, not before.

| Key | ar | en |
| --- | --- | --- |
| `auditor.reports.lockedCta` | الانتقال إلى تبويب «الاعتماد» | Go to the approvals tab |
| `auditor.approvals.emptyHint` | جرّب تغيير التصفية أو البحث بكلمة أخرى. | Try a different filter or search term. |
| `auditor.reports.approvedCount` | {count} إقفال معتمد | {count} approved closings |

All other auditor copy existed before this batch (labels, empty/error
copy, lock explanation, button text).
