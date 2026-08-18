# CLOSING_STEP1_I18N_KEYS — new i18n keys (do NOT regenerate i18n.ts)

Add these keys to `app/lib/i18n.ts` under both `ar` and `en` dictionaries.

## New keys

| Key | AR (suggested) | EN (suggested) |
|---|---|---|
| `wizard.step1.tip` | نصيحة: ارفق تقرير Z من Foodics وصور إثباتات المدفوعات لتسريع المراجعة والتدقيق. | Tip: attach the Foodics Z-report and payment proof photos to speed up review and auditing. |
| `wizard.step1.basicTitle` | البيانات الأساسية للتقرير | Basic report data |
| `wizard.step1.cashHanded` | النقد المسلَّم فعليًا (ر.س) — اختياري | Actual cash handed (SAR) — optional |
| `wizard.step1.zreportTitle` | تقرير Z من Foodics | Foodics Z-report |
| `wizard.step1.zreportDrop` | اسحب صورة تقرير Z هنا أو اضغط للاختيار | Drop the Z-report photo here or tap to browse |
| `wizard.step1.zreportHint` | JPG / PNG / WEBP / HEIC | JPG / PNG / WEBP / HEIC |
| `wizard.step1.attached` | تم الإرفاق | Attached |
| `wizard.step1.replace` | استبدال | Replace |
| `wizard.step1.proofsTitle` | إثباتات المدفوعات | Payment proofs |
| `wizard.step1.proofMada` | مدى | Mada |
| `wizard.step1.proofCash` | إيصال / قسيمة إيداع النقد | Cash deposit / receipt |
| `wizard.step1.proofVisa` | فيزا | Visa |
| `wizard.step1.optional` | اختياري | Optional |
| `wizard.step1.addImage` | إضافة صورة | Add image |
| `wizard.step1.cta` | استخراج القيم والاستمرار إلى التأكيد | Extract & continue to confirmation |

## Removed usage (keys still exist, no longer referenced)

- `wizard.proofs` — replaced by the three-slot proof UI (kept for other consumers if any; safe to retire after audit).

## Unchanged

All existing keys (`wizard.title`, `wizard.step1.title`, `wizard.zreport`, `wizard.date`, `wizard.step2.*`, `wizard.ai.*`, `wizard.save*`, etc.) remain in use as before.

