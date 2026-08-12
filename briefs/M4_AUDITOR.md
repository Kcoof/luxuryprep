# Implementation Brief — M4 Auditor portal (3 tabs)

**Constitution:** Model Constitution  
**Author:** GLM only  
**Review after:** Claude → Codex

## Output format (same as M3 — NO diffs)

Return complete final contents of every file you touch:

```
===FILE: path/to/file.ext===
<entire file content>
===ENDFILE===
```

No markdown fences. No ellipses. End with `END_M4`.

## Product scope (FOUNDATION.md — Portal 2)

Arabic RTL auditor portal at `/auditor` with **three tabs**:

### Tab 1 — الاعتماد (Approvals)
- List closings from Supabase `daily_closings` (join/display branch name from `branches`).
- Filter: all / pending / approved / rejected.
- Open a detail view (modal or split panel): Z-report image (via `resolveImageUrl` from `app/lib/closings.ts` — bucket is **private**), payment proofs, `reviewedData` vs `aiExtractedData`, highlight `manuallyModifiedFields`, shortage/excess with `ر.س`.
- Actions on **pending** only: **اعتماد** (approve) / **رفض** (reject) + required Arabic comment for reject (optional for approve).
- On action: UPDATE closing `status`, `auditor_comment`, `auditor_reviewed_at`, `updated_at`; INSERT audit log `actor_role: "auditor"`, `action: "approved"|"rejected"`.

### Tab 2 — التقارير الموحدة (Unified reports — **gated**)
- Compute `pendingCount` of closings with `status = 'pending'`.
- If `pendingCount > 0`: show Arabic lock alert; **do not** show KPIs/tables (gate).
- If clear: KPIs — إجمالي المبيعات, النقدية المسلّمة, صافي العجز/الزيادة, المرتجعات — aggregated from `reviewed_data` of **approved** closings (optional date range filter).
- Simple table by branch/date. Excel export optional (CSV download is enough). Print via `window.print` CSS ok.

### Tab 3 — سجل التدقيق (Digital audit log)
- Timeline from `daily_closing_audit_logs` (newest first), show closing id, action Arabic label, actor_role, comment, timestamp.
- Optional filter by closing id / action.

## Schema gap — must fix with migration

`002_daily_closings.sql` has INSERT + SELECT only — **no UPDATE policy**. Types expect auditor fields that are not in the table yet.

Add `supabase/migrations/005_auditor.sql` (idempotent, same header style as 002/004):

```sql
-- columns
auditor_id text
auditor_comment text
auditor_reviewed_at timestamptz

-- RLS
create policy for UPDATE on daily_closings for anon, authenticated
  using (true) with check (true);
```

Do not drop tables. Do not weaken DELETE (there is none — keep it that way).

## Files to produce / modify

1. `app/auditor/page.tsx` — full client portal replacing the M1 shell (may split into `app/auditor/*` components if clearer; prefer few files).
2. `app/lib/closings.ts` — extend with list/fetch/approve/reject helpers (keep existing save/duplicate/resolveImageUrl behavior intact — do not regress M2/M3 cashier).
3. `supabase/migrations/005_auditor.sql` — new.
4. Optionally small shared Arabic status badges helper — only if needed.

## Constraints

- `"use client"` where hooks are used. Lazy `getSupabase()` only — never module-scope client.
- Reuse `DailyClosing`, `ClosingStatus`, `FinancialFields`, `computeShortageOrExcess`, `resolveImageUrl` / `resolveImageUrls`.
- No new npm dependencies. No secrets. Do not touch cashier page, `.gitignore`, `briefs/`, or GLM API route.
- Auth is **out of M4** — no login wall; same open anon pattern as cashier (v1).
- `npm run build` must stay green. Arabic RTL. SAR as `ر.س`.
- Design tokens already in globals (emerald approve, rose reject, amber pending).

## Out of scope

- M5 seed/README/Vercel docs.
- Supabase Auth roles.
- Realtime subscriptions (optional nice-to-have — skip unless trivial).
- Changing Storage policies.

## Known facts

- Images are stored as **object paths** in `z_report_image_url` (or legacy absolute URLs); always use `resolveImageUrl` before `<img src>`.
- Cashier already writes `ai_extracted` / `cashier_confirmed` audit rows on submit.
- Branch list: `public.branches`.
