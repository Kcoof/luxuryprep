# GLM revision request — M1 round 2/3

Claude + Codex reviews blocked adoption. Produce a **corrected** unified diff for M1 only.

## Must fix (blocking)
1. Every `diff --git` / `+++` path must be consistent. Especially `app/auditor/page.tsx` (not `auditor/page.tsx`).
2. Every hunk header `@@ -0,0 +1,N @@` must equal the exact number of `+` body lines in that hunk.
3. `app/lib/supabase.ts` must NOT call `createClient("", "")` at module load. Use lazy init / guard so missing env does not throw on import.

## Should fix
4. Move `tailwindcss-animate` to `dependencies` (not only devDependencies).
5. Do not gitignore `next-env.d.ts` if you also add it — pick one (prefer let Next generate; omit from commit OR remove from gitignore).
6. Optional: drop unused lint script or add eslint-config-next — prefer omit lint script for M1 if no eslint.

## Still in scope
Same M1 brief as before. No Gemini. No secrets. No M2–M5 features.

## Return
Unified diff only, end with END_DIFF.
