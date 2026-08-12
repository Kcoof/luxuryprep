# M4 Round 1 — Escalation (reviewers unavailable)

Artifact: `briefs/M4_STAGED/` — staged, **not applied**.

```
Claude: UNAVAILABLE (API usage limit) — attempted
Codex:  UNAVAILABLE (API usage limit) — attempted
```

## GLM R1 delivered (3 files)

- `supabase/migrations/005_auditor.sql` — auditor_id/comment/reviewed_at + UPDATE RLS
- `app/lib/closings.ts` — list/get/countPending/listAuditLogs/approveClosing/rejectClosing; saveClosing retained
- `app/auditor/page.tsx` — 3 tabs: الاعتماد / التقارير الموحدة (gated) / سجل التدقيق

## CUROK smoke (not a substitute for Approve)

| Check | Result |
|---|---|
| saveClosing / checkDuplicate / resolveImageUrl present | OK |
| approve/reject UPDATE + audit insert | OK |
| reject requires comment | OK (`throw` if empty) |
| pendingCount gates reports | OK |
| resolveImageUrl in auditor UI | OK |
| Arabic labels اعتماد/رفض/سجل/التقارير | OK |
| `"use client"` | OK |

## Decision required

1. **Wait** — retry Claude + Codex when quota recovers  
2. **Waive reviews** — apply R1 now (same pattern as M3 R5)  
3. **Halt**

After apply, user must run `005_auditor.sql` in Supabase (UPDATE policy is required for approve/reject).
