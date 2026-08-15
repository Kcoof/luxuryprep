# Login UX R2 — exact reviewer fixes only

Emit full files. End END_LOGIN_UX.

1) app/lib/i18n.ts — revert wizard.ai.err.unexpected EN to exactly:
   "An unexpected error occurred during analysis."
   (remove the word "the")

2) app/login-form.tsx:
   - portalHint paragraph: text-slate-400 → text-slate-500
   - SUBMIT_CLASS: change active:scale-[0.98] to motion-safe:active:scale-[0.98]
   - both session buttons (Continue + Logout): min-h-9 → min-h-11

No other changes.
