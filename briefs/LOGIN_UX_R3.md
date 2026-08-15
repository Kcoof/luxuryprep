# Login UX R3 — i18n only (stop dictionary drift)

Do NOT regenerate the whole dictionary from memory.

Start from the CURRENT LIVE `app/lib/i18n.ts` provided in context.
Add ONLY this new key (place near other login.* keys):

"login.portalHint": {
  ar: "<use the Arabic from staged R2 login.portalHint>",
  en: "<use the English from staged R2 login.portalHint>",
}

Copy the exact AR/EN strings from the STAGED portalHint entry also provided.
Change nothing else — every wizard.* / admin.* string must stay byte-identical to LIVE.

Emit full file `app/lib/i18n.ts` only. End END_LOGIN_UX.
