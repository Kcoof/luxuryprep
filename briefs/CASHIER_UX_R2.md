# Cashier UX R2 — narrow fixes (Critical + Major)

Emit full `app/cashier/page.tsx` only (unless badge helper is elsewhere in same file).

1. CRITICAL: Fix `value={rawValues.netSales"}` → `value={rawValues.netSales}` (and scan for any other stray quote typos in value={rawValues.*}).
2. MAJOR: FieldBadgePill kind="ai" → neutral slate (`bg-slate-200 text-slate-700` or similar), NOT emerald. Keep manual as amber. Emerald stays for verified shortage/excess success only.
3. Optional: static aria-label on stepper nav (e.g. reuse wizard.title or a fixed string via existing key) — not Critical.

Do not touch dashboard-sections, locale-toggle, globals, i18n dictionary.
Do not change business logic.

End END_CASHIER_UX.
