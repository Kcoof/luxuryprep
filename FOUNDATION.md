# Foundation Record — Daily Financial Closing & POS Audit (`luxuryprep` / `Newproject`)

**Status:** Confirmed (user 2026-08-11) — product pivot + GLM extract  
**Repo:** https://github.com/Kcoof/luxuryprep  
**Project Constitution:** Settled  
**Model Constitution:** Active — M1–M5 complete  
**Supersedes:** prior “Branch Health / tech-health” product idea (kept only as archived sibling reference)

---

## Core idea

Enterprise **Daily Financial Closing & POS Audit System** (نظام الإغلاق المالي اليومي والمراجعة للفروع) for multi-branch retail/restaurant businesses in **Saudi Arabia** (SAR, Arabic RTL). Branch cashiers submit daily Foodics Z-report / closing packages (images + optional payment proofs); **GLM** extracts financial fields; cashiers confirm; **financial auditors** approve/reject, then unlock unified reports and a digital audit log.

## Vision

- Local `npm run build` / `npm run dev` and **Vercel** deploy succeed.
- Supabase holds branches, closings, audit logs; Storage holds receipt images.
- **GLM** (Z.ai) vision/extract extracts Foodics receipt fields with confidence scores.
- Cashier 3-step flow and auditor 3-tab portal work end-to-end in Arabic RTL.
- No silent duplicate closing for same branch + business date without confirmation.
- Auditor unified reports stay **gated** until all pending closings are cleared.

## Structure + hierarchy

**Canonical home:** `Newproject` / GitHub `luxuryprep` only.

**Decision order:** User → this Foundation → Model Constitution → GLM authors → Claude → Codex → CUROK transport.

**Technical order:**
1. Types / Postgres schema (`FinancialFields`, `DailyClosing`, audit log)
2. Supabase client + Storage buckets
3. Design system (RTL + palette below)
4. Cashier portal (3-step closing)
5. `POST` AI analyze API (**GLM** / Z.ai)
6. Auditor portal (approvals → gated reports → audit log)
7. RLS / seed / Vercel env

**Layout (adapted for Vercel + locked Supabase):**

```
Newproject/
├─ FOUNDATION.md
├─ README.md                   # operator runbook (M5)
├─ app/                         # Next.js App Router (Arabic RTL)
│  ├─ api/analyze-closing-image # GLM vision/extract (server) — replaces Express /api
│  ├─ (cashier)/…               # Branch employee portal
│  ├─ (auditor)/…               # Financial auditor portal
│  ├─ types/                    # Branch, FinancialFields, DailyClosing, AuditLog
│  ├─ lib/supabase.ts
│  └─ components/…
├─ supabase/
│  ├─ migrations/               # 001–005 + RLS + storage
│  ├─ seed_branches.sql         # idempotent 20-branch seed (M5)
│  ├─ seed_branches.json
│  ├─ BRANCHES.md               # B19 gap note
│  └─ CUTOVER.md                # ops checklist (M5)
├─ .env.local                   # Supabase keys (gitignored)
├─ .sec                         # GLM_API_KEY / GLM_BASE_URL / GLM_MODEL / GLM_VISION_MODEL (gitignored)
└─ …
```

**Stack lock (reconciled):**

| Brief suggested | Foundation lock (this project) |
|-----------------|--------------------------------|
| Vite + React + Express `:3000` | **Next.js 14 App Router** on **Vercel** (same UX; API route instead of Express) |
| Generic `Db` adapter | **Supabase** Postgres + Storage + Auth + Realtime (already approved) |
| `@google/genai` Gemini Vision | **Replaced by GLM** — server-only API route using Z.ai Coding Plan (`glm-4.6v`, credentials from `.sec` / env) |
| Foodics Z-report image audit | **Keep** — core product |

## Design system (imported)

- **Language:** Arabic RTL (`dir="rtl"`); financial terms (إجمالي المبيعات، الكاش الفعلي المورد، العجز/الزيادة، العكسيات والمرتجعات).
- **Palette:** Slate-900/950 framing; Slate-50/white content; Emerald success/verified cash; Amber pending/reversals; Rose shortage/reject.
- **Layout:** High-contrast, dense dashboard grids, responsive mobile fallback; Lucide icons only.
- **Currency:** SAR.

## Roles & portals (imported)

### Portal 1 — Cashier / branch employee (شاشة الكاشير)

- Branch **locked** to assigned `branchId` (`isBranchLocked`); show read-only badge. Auditors/admins may select any branch.
- **3-step submission:**
  1. Upload Foodics Z-report / closing image (+ optional Mada / cash deposit / Visa proofs); `businessDate`; optional `manualActualCash`.
  2. **GLM** extract → review/edit fields → show `shortageOrExcess = cashActualHanded - cashSystem`; guard double-submit (`isSaving`).
  3. Success card with Closing ID (e.g. `close-123456`); status «بانتظار اعتماد الإدارة المالية».
- **Rule:** never duplicate same `branchId` + `businessDate` without explicit confirmation.

### Portal 2 — Financial auditor (الإدارة المالية والمراجعة)

1. **Approvals:** list closings; filter pending/approved/rejected; split-screen modal (image zoom vs AI / cashier / auditor fields; flag manual edits); Approve / Reject + comment.
2. **Unified reports (gated):** locked while `pendingCount > 0` with Arabic alert; when clear, KPIs for gross sales, actual cash handed, net shortage/excess, reversals/refunds; tables + Excel/Print.
3. **Digital audit log:** timeline of upload, AI extract + confidence, cashier edits, approve/reject.

## Data schemas (imported — map to Supabase)

Core TypeScript contracts (implementation may use snake_case columns):

- `Branch` — `id`, `name`, `city`
- `FinancialFields` — `grossSales`, `netSales`, `cashSystem`, `cashActualHanded`, `spanSystem`, `deliveryAppsSystem`, `reversedTransactions`, `shortageOrExcess`
- `FieldConfidence` — optional 0–1 per financial field
- `DailyClosing` — ids, `businessDate`, status `pending|approved|rejected`, image URLs, `aiExtractedData`, `aiConfidence`, `reviewedData`, `manuallyModifiedFields`, auditor fields, timestamps
- `DailyClosingAuditLog` — `closingId`, actor role (`cashier|manager|auditor|ai`), action (`uploaded|ai_extracted|cashier_confirmed|approved|rejected|modified`), comment, timestamp

**Tables (v1):** `branches`, `daily_closings`, `daily_closing_audit_logs` (+ Storage for report/proof images).  
**Auth:** Supabase Auth — roles `cashier` / `manager` / `auditor` (branch assignment for non-auditors). **Deferred past v1 — see Known scope notes.**

## AI Vision (GLM — user override 2026-08-11)

- **No Gemini.** Image analysis uses **GLM** via Z.ai Coding Plan API.
- Server endpoint: `POST /api/analyze-closing-image` (Next.js route).
- Body: `{ imageBase64 }` (limit ~10mb).
- Credentials: `GLM_API_KEY`, `GLM_BASE_URL=https://api.z.ai/api/coding/paas/v4`, `GLM_MODEL=GLM-5.2` (text-only authoring, not used by the vision route), **`GLM_VISION_MODEL=glm-4.6v`** (from `.sec` locally; mirrored as server env on Vercel — never `NEXT_PUBLIC_`).
- Prompt task: expert POS Z-report reader; respond **ONLY** with raw JSON: `grossSales`, `netSales`, `cashSystem`, `spanSystem`, `deliveryAppsSystem`, `reversedTransactions`.

### Vision probe results (2026-08-12) — open point 1 resolved

Verified against the live endpoint (`briefs/probe_glm_vision.js`, `briefs/probe_glm_ocr.js`):

- **`GLM-5.2` cannot accept images.** Returns `400 code 1210 — messages.content.type is invalid, allowed values: ['text']`. It stays the *authoring* model only.
- **`glm-4.6v` works** (`glm-4.5v` also works). Extraction must use a separate `GLM_VISION_MODEL`; do not reuse `GLM_MODEL`.
- The endpoint's `/models` list omits `glm-4.6v` despite it working — **the list is not authoritative**, do not feature-detect from it.
- **`thinking: { type: "disabled" }` is mandatory.** With thinking on, the model spends the whole `max_tokens` budget reasoning and returns empty content with `finish_reason: length`. Disabled: `finish=stop`, 111 completion tokens, ~6s. Enabled: empty, ~31s.
- Accuracy on an Arabic RTL Z-report fixture (`briefs/fixtures/zreport-probe.html`): **10/11 fields exact**, including every monetary value and thousands-separator handling. Only `branchCode` came back `null`, which is harmless — branch is fixed by the cashier's locked session, not read from the image.
- Budget note: ~4.2k prompt tokens per image, so the route needs a per-image cost/size guard.
- Client computes/displays `cashActualHanded` (manual or from proof flow) and `shortageOrExcess`.
- Confidence scores: include when GLM returns them; otherwise mark fields unscoped / default handling in UI.

## Feasibility across empires

| Empire | Verdict |
|--------|---------|
| Product / KSA retail finance | Pass — clear cashier + auditor workflows |
| Supabase + Vercel | Pass — already connected (`uujujcudeucabykfztic`, GitHub `luxuryprep`) |
| GLM Vision/extract (Z.ai) | **Pass — verified 2026-08-12.** `glm-4.6v` extracted 10/11 fields from an Arabic Z-report in ~6s. Requires `thinking: disabled`; `GLM-5.2` is text-only |
| Arabic RTL / Windows | Risk — UTF-8 discipline |
| Brief’s Vite+Express | **Adapted** — not used as-is; Next API routes instead |
| Gemini | **Out** — replaced by GLM per user |
| Old Branch Health Firebase siblings | Out of product scope — archive reference only |

## Clear foundation checklist

**Understood**

- [x] Product = Daily Financial Closing & POS Audit (not Branch Health tech checklist)
- [x] Arabic RTL + SAR + Foodics receipt auditing
- [x] Supabase = main DB/Storage/Auth
- [x] Vercel + GitHub `luxuryprep`
- [x] **GLM** (not Gemini) for Z-report extraction
- [x] Cashier 3-step + auditor 3-tab (gated reports)
- [x] Duplicate branch+date guard; branch lock for cashiers
- [x] Supabase URL + publishable key present in `.env.local` (gitignored)
- [x] GLM credentials pattern via `.sec` / `.sec.example`

**M1–M5 closure items (all complete)**

- [x] User confirms this updated Foundation (product pivot + GLM) — confirmed 2026-08-11
- [x] `GLM_API_KEY` available to the **server** on Vercel (set 2026-08-12 during M5 cutover)
- [x] Seed branch list — `supabase/seed_branches.sql` shipped in M5 (20 branches, no B19)
- [x] Auditor/cashier **users** seeding — deferred past v1 (v1 uses anon RLS as today)

## v1 scope / out of scope

**In v1:** Cashier portal (3 steps), **GLM** extract API, auditor approvals + gated unified reports + audit log, Supabase persistence/Storage, Arabic RTL design system above, duplicate-date confirmation, branch lock, Vercel deploy.

**Out of v1:** Gemini; Branch Health IT checklist product; Firebase; multi-company SaaS tenancy; native mobile apps; full Foodics live API sync (image/Z-report audit only); petty cash module beyond what lands in closing fields (defer unless user re-opens); Supabase Auth role-based user seeding (anon RLS as today until a future milestone).

## Known scope notes (post-M5)

- **Auth roles deferred.** v1 keeps the anon-RLS posture that production uses today; no cashier/manager/auditor user rows are seeded. Tightening to real Supabase Auth roles is a future milestone.
- **B19 is intentionally absent** from branch seed (not in source list). See `supabase/BRANCHES.md`.
- **Old Branch Health / Firebase siblings** remain out of product scope — archive reference only; do not merge or delete.

## Glossary

- **Closing** — one branch’s daily financial package for a `businessDate`
- **Shortage/Excess** — `cashActualHanded - cashSystem` (عجز / زيادة)
- **Gated reports** — unified financial reports locked while any closing is `pending`
- **Publishable key** — Supabase anon/public client key
- **Transport** — CUROK applies GLM output byte-for-byte only

## Open points escalated to user

1. ~~Confirm GLM multimodal/image path works for Foodics receipts during M3.~~ **Resolved 2026-08-12** — `glm-4.6v` verified; no manual-entry fallback needed. See “Vision probe results”.
2. ~~Seed branch list + auditor/cashier users.~~ **Branch seed shipped 2026-08-12** (`supabase/seed_branches.sql`, 20 rows, no B19). Auth users remain deferred past v1.
3. Validate extraction against a **real** Foodics Z-report photo (the probe used a clean synthetic render; camera glare, skew and crumpled paper are untested). **Still open.**

---

## Milestones

1. **M0** — Foundation — **done** (confirmed 2026-08-11)  
2. **M1** — Skeleton: Next + types + Supabase client + design tokens + portal shells; `npm run build` — **done** (GLM R3 approved by Claude+Codex; applied 2026-08-11)  
3. **M2** — Cashier 3-step + Storage uploads + duplicate-date guard + branch lock — **done** (R4 applied under user waiver A+B 2026-08-12; known Majors deferred)  
4. **M3** — **GLM** `/api/analyze-closing-image` + confirmation UI — **done** (R5 applied under user waiver 2026-08-12; reviewers rate-limited)  
5. **M4** — Auditor tabs (approvals, gated reports, audit log) — **done** (R1 applied under user waiver 2026-08-12; reviewers rate-limited)  
6. **M5** — Documentation & cutover: `README.md`, `supabase/seed_branches.sql`, `supabase/CUTOVER.md`, `.env.local.example` GLM section, Vercel server env `GLM_API_KEY` / `GLM_BASE_URL` / `GLM_VISION_MODEL=glm-4.6v` — **done** (2026-08-12)  
7. **M6** — Login gateway + demo session + IT shell — **done** (2026-08-15): `/` login (cashier branch / finance / IT), brand **luxuryprep**, Supabase branches only (no Firebase), `/admin` IT shell ready for later features

All previous “Post-M3 still open” and “Post-M4 user action” items are closed as of M5 (2026-08-12). The only remaining open product item is point 3 above: real Foodics photo validation.

---

`Foundation confirmed — M1–M6 complete. Remaining work is real-photo validation, IT panel features, and (future) Supabase Auth roles.`