# Implementation Brief — M1 Skeleton

**Constitution:** Model Constitution active  
**Author:** GLM-5.2 only  
**Reviewers after:** Claude → Codex  
**CUROK:** transport only (byte-for-byte apply of approved artifact)

## User request

Confirm foundation and start M1.

## Scope (M1 only — do not implement M2–M5 features)

Scaffold Next.js 14 App Router + TypeScript + Tailwind in repo root `Newproject` / `luxuryprep` for **Daily Financial Closing & POS Audit**:

1. `package.json` with: next@14.2, react@18.2, react-dom@18.2, typescript, tailwindcss@3.4, postcss, autoprefixer, tailwindcss-animate, clsx, tailwind-merge, lucide-react, `@supabase/supabase-js`
2. Configs: `next.config.js`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `next-env.d.ts`
3. `app/layout.tsx` — `lang="ar" dir="rtl"`, metadata Arabic title for financial closing
4. `app/globals.css` — design tokens: slate/emerald/amber/rose; RTL body
5. `app/page.tsx` — simple hub linking to `/cashier` and `/auditor` (shells only)
6. `app/types/index.ts` — Branch, FinancialFields, FieldConfidence, DailyClosing, DailyClosingAuditLog per FOUNDATION.md
7. `app/lib/supabase.ts` — browser client from `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
8. `app/lib/utils.ts` — `cn()` helper
9. `app/cashier/page.tsx` — shell placeholder only (Arabic title شاشة الكاشير)
10. `app/auditor/page.tsx` — shell placeholder only (Arabic title الإدارة المالية والمراجعة)
11. Update `.gitignore` if needed (already has Next/env)
12. Keep existing: `FOUNDATION.md`, `.sec.example`, `.env.local.example` — do not delete; do not commit secrets
13. Do **not** implement Gemini, full cashier wizard, auditor tabs, GLM analyze API, or SQL migrations in M1
14. Must pass `npm install && npm run build`

## Return format (required)

1. List of touched files  
2. Full file bodies for each new/changed file OR one unified diff  
3. Short note: how to run locally  

Do not include `.sec` or real API keys in any file.
