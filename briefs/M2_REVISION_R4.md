# GLM M2 R4 — fix Major findings only

Prior R3 cleared Critical items. Claude+Codex need these Majors fixed. Return a FULL replacement unified diff (all M2 files), applyable, END_DIFF.

## Must fix
1. `saveClosing`: if Supabase insert returns error, do NOT pretend success. Show Arabic error OR explicitly mark offline/queued save in UI.
2. `checkDuplicateClosing`: on query error, fall back to localStorage check (do not assert no-duplicate).
3. Put migration at `supabase/migrations/002_daily_closings.sql` (NOT `supabase/002_...`).
4. Do not write multi-MB base64 into Postgres URL columns. If Storage upload fails, keep image in local queue only / show warning; DB fields null or omit until real URL.
5. Persist branch session in localStorage (`branchId`/`branchName`).
6. Step 3: add «بدء إقفال جديد» button as well as home.
7. Strip markdown fences — raw `diff --git` only. Exact hunk counts.

Keep all prior Critical fixes (branch lock, duplicate confirm, RLS policies, FOUNDATION fields, useEffect, close-* success).
