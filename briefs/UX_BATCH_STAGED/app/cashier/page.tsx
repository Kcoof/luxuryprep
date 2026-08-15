"use client";

// M7 — cashier branch screen (luxuryprep, bilingual AR/EN).
// UX polish pass: the closing wizard stays the PRIMARY job — the prep
// dashboard (checklist + IT status) now sits in a compact collapsible
// section above it instead of burying it. Touch targets ≥44px on primary
// actions, palette tightened to slate/emerald/amber/rose (the AI panel
// moved from violet to emerald accents), a real stepper with a progress
// caption, and a high-contrast shortage/excess block. R2: AI-origin field
// badges are neutral SLATE so emerald reads exclusively as verified
// shortage/excess + success. The M2–M6 wizard logic below (branch lock,
// duplicate guard, AI extraction with abort/versioning, save/offline
// queue) is UNCHANGED — presentation only.
//
// F3 (R4): runtime messages use stable codes end-to-end. The analyze API
// returns a `code` equal to an i18n key; closings.ts warnings ARE i18n
// keys and its cashier-path throws use keys as Error.message. This page
// translates via t(locale, code) + hasTranslation() — no prose matching.
//
// UX batch (Part A):
//   A1 — the AI "no values extracted" notice renders in amber/neutral
//        (aiNoticeKind === "empty"); emerald + Check is reserved for the
//        filled > 0 success notice.
//   A2 — NumberInput takes a stable caller-supplied `id`; the label uses
//        htmlFor and the parse-error <p> is wired via aria-describedby.
//        No save/AI/duplicate logic changed.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calculator,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock,
  LifeBuoy,
  Loader2,
  Lock,
  LogOut,
  Minus,
  RotateCcw,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import {
  Branch,
  FinancialFields,
  EMPTY_FINANCIAL_FIELDS,
  computeShortageOrExcess,
} from "../types";
import { loadBranches } from "../lib/branches";
import {
  checkDuplicateClosing,
  saveClosing,
  ClosingResult,
} from "../lib/closings";
import { clearSession, getSession, type Session } from "../lib/auth";
import LocaleToggle from "../components/locale-toggle";
import {
  DEFAULT_LOCALE,
  dirFor,
  getLocale,
  hasTranslation,
  setLocale as persistLocale,
  t,
  type Locale,
} from "../lib/i18n";
import {
  ItStatusWidget,
  ItTicketModal,
  PreCloseChecklist,
} from "./dashboard-sections";

type Step = 1 | 2 | 3;

const BRANCH_SESSION_KEY = "cashier_selected_branch";

interface SavedBranch {
  id: string;
  name: string;
}

type MonetaryKey =
  | "grossSales"
  | "netSales"
  | "cashSystem"
  | "cashActualHanded"
  | "spanSystem"
  | "deliveryAppsSystem"
  | "reversedTransactions";

const AI_EXTRACTABLE_FIELDS: MonetaryKey[] = [
  "grossSales",
  "netSales",
  "cashSystem",
  "cashActualHanded",
  "spanSystem",
  "deliveryAppsSystem",
  "reversedTransactions",
];

const EMPTY_RAW_VALUES: Record<MonetaryKey, string> = {
  grossSales: "",
  netSales: "",
  cashSystem: "",
  cashActualHanded: "",
  spanSystem: "",
  deliveryAppsSystem: "",
  reversedTransactions: "",
};

// Align with migration 003 allowed_mime_types — gif is rejected by the bucket.
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic";

type FieldBadge = "ai" | "manual" | null;

// ----------------------------------------------------------------------
// UX polish — shared class tokens (match the login gateway language:
// min-h-11 touch targets, restrained focus-visible rings, logical props).
// ----------------------------------------------------------------------

const INPUT_CLASS =
  "w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const FILE_INPUT_CLASS =
  "block w-full cursor-pointer text-sm text-slate-500 file:me-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 focus-visible:outline-none";

const PRIMARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:pointer-events-none disabled:opacity-50";

const HEADER_ACTION_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:pointer-events-none disabled:opacity-50";

// AI extraction is an assist (secondary to save), so it reads as an
// emerald-outline action on a quiet slate card — no violet, no glow.
const AI_BUTTON_CLASS =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:pointer-events-none disabled:opacity-50";

/**
 * B1: parse localized monetary input safely.
 *
 * Normalizes Arabic-Indic digits, maps Arabic separators, then decides which
 * single character is the decimal point — stripping all other separators and
 * converting ONLY that one character. Never re-normalizes after conversion.
 *
 * Verified test cases:
 *   "1234"      -> 1234
 *   "1234.50"   -> 1234.5
 *   "1,234.50"  -> 1234.5
 *   "1.234,50"  -> 1234.5
 *   "1,234"     -> 1234
 *   "12,5"      -> 12.5
 *   "١٢٣٫٥٠"     -> 123.5
 *   "١٬٢٣٤٫٥٠"   -> 1234.5
 *   "-25.00"    -> -25
 *   "0"         -> 0
 */
function parseLocalizedNumber(raw: string): number | null {
  if (typeof raw !== "string") return null;

  // Step 1: Map Arabic-Indic (٠-٩) and Eastern Arabic (۰-۹) digits to ASCII.
  let s = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  // Step 2: Map Arabic separators to ASCII equivalents.
  //   U+066B (٫) = Arabic decimal separator -> "."
  //   U+066C (٬) = Arabic thousands separator -> strip
  //   U+060C (،) = Arabic comma -> ","
  s = s
    .replace(/[\u066b]/g, ".")
    .replace(/[\u066c]/g, "")
    .replace(/[\u060c]/g, ",");

  // Step 3: Strip whitespace used as thousands separators.
  s = s.replace(/[\s\u2009\u202f]/g, "");

  s = s.trim();
  if (s === "" || s === "-" || s === ".") return null;

  // Step 4: Decide which character is the decimal separator, then build
  // the integer and fractional parts independently. This ensures exactly
  // ONE normalization pass — no re-normalization of already-converted
  // values.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  let intPart = "";
  let fracPart = "";

  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the rightmost separator is the decimal point.
    if (lastDot > lastComma) {
      // Dot is decimal — commas are thousands.
      intPart = s.slice(0, lastDot).replace(/,/g, "");
      fracPart = s.slice(lastDot + 1);
    } else {
      // Comma is decimal — dots are thousands.
      intPart = s.slice(0, lastComma).replace(/\./g, "");
      fracPart = s.slice(lastComma + 1);
    }
  } else if (lastDot >= 0) {
    // Only dots. Multiple dots → all are thousands separators.
    const dotCount = (s.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      intPart = s.replace(/\./g, "");
    } else {
      intPart = s.slice(0, lastDot);
      fracPart = s.slice(lastDot + 1);
    }
  } else if (lastComma >= 0) {
    // Only commas. Multiple → all are thousands separators.
    const commaCount = (s.match(/,/g) ?? []).length;
    if (commaCount > 1) {
      intPart = s.replace(/,/g, "");
    } else {
      // Single comma. Heuristic: if followed by exactly 3 digits at end
      // and preceded by 1–3 digits, treat as thousands (e.g. "1,234").
      // Otherwise treat as decimal (e.g. "12,5" → 12.5).
      const tail = s.slice(lastComma + 1);
      const headDigits = s.slice(0, lastComma).replace(/[^\d]/g, "");
      if (
        tail.length === 3 &&
        /^\d+$/.test(tail) &&
        /^\d{1,3}$/.test(headDigits)
      ) {
        intPart = s.replace(/,/g, "");
      } else {
        intPart = s.slice(0, lastComma);
        fracPart = tail;
      }
    }
  } else {
    // No separators at all.
    intPart = s;
  }

  // Keep only digits and a leading minus in the integer part.
  intPart = intPart.replace(/[^\d-]/g, "");
  fracPart = fracPart.replace(/\D/g, "");

  // Collapse multiple minus signs to a single leading one.
  if (intPart.startsWith("-")) {
    intPart = "-" + intPart.replace(/-/g, "");
  } else {
    intPart = intPart.replace(/-/g, "");
  }

  let numeric: string;
  if (fracPart !== "") {
    numeric = intPart + "." + fracPart;
  } else {
    numeric = intPart;
  }

  if (numeric === "" || numeric === "-" || numeric === ".") return null;

  const n = Number(numeric);
  return Number.isFinite(n) ? n : null;
}

function coerceMonetary(n: number | null): number {
  if (n === null || !Number.isFinite(n)) return 0;
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(rounded)) return 0;
  if (Math.abs(rounded) > 1e12) return 0;
  return rounded;
}

function todayInRiyadh(): string {
  // M7: Saudi Arabia is UTC+3. Compute the business date in Asia/Riyadh
  // explicitly so a late-night close (00:00–03:00 local) is not attributed
  // to the previous UTC day.
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date());
  } catch {
    const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }
}

export default function CashierPage() {
  // ------------------------------------------------------------------
  // M7: bilingual locale state. Default Arabic; persisted preference in
  // localStorage (`luxuryprep_locale`). AR => dir="rtl", EN => dir="ltr".
  // ------------------------------------------------------------------
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const dir = dirFor(locale);

  useEffect(() => {
    setLocale(getLocale());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const prevLang = root.lang;
    const prevDir = root.dir;
    root.lang = locale;
    root.dir = dir;
    return () => {
      // F2 (R3): restore the pre-mount document lang/dir on unmount so an
      // EN cashier session cannot leak LTR into the Arabic-only auditor.
      root.lang = prevLang;
      root.dir = prevDir;
    };
  }, [locale, dir]);

  const handleLocaleChange = useCallback((next: Locale) => {
    persistLocale(next);
    setLocale(next);
  }, []);

  // M7: IT ticket modal state.
  const [ticketOpen, setTicketOpen] = useState(false);

  const [step, setStep] = useState<Step>(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<boolean>(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isBranchLocked, setIsBranchLocked] = useState(false);
  const [businessDate, setBusinessDate] = useState<string>(todayInRiyadh());
  const [fields, setFields] = useState<FinancialFields>({
    ...EMPTY_FINANCIAL_FIELDS,
  });
  // B2: raw string buffer per monetary field. The displayed value comes
  // from this buffer — never reformatted while the field has focus.
  const [rawValues, setRawValues] = useState<Record<MonetaryKey, string>>(
    () => ({ ...EMPTY_RAW_VALUES }),
  );
  // O1: cashActualHanded now uses the same rawValues buffer as every other
  // monetary field. useManualCash controls only the label/affordance and
  // whether manual_actual_cash is persisted — not which buffer is read.
  const [useManualCash, setUseManualCash] = useState(false);
  const [parseErrors, setParseErrors] = useState<Set<MonetaryKey>>(
    new Set(),
  );
  const [zReportImage, setZReportImage] = useState<string | null>(null);
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // F3 (R4): entries are stable i18n keys (wizard.warn.*) from closings.ts.
  const [warnings, setWarnings] = useState<string[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [saveSource, setSaveSource] = useState<
    ClosingResult["source"] | null
  >(null);
  const pendingBranchRestore = useRef<SavedBranch | null>(null);

  // ------------------------------------------------------------------
  // M6: login gateway guard. A cashier/manager session with a locked
  // branch (written by the gateway together with cashier_selected_branch)
  // is required — otherwise bounce back to the login gateway.
  // ------------------------------------------------------------------
  const router = useRouter();
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const session = getSession();
    const allowed =
      session !== null &&
      (session.role === "cashier" || session.role === "manager") &&
      typeof session.branchId === "string" &&
      session.branchId !== "";
    if (!allowed) {
      router.replace("/");
      return;
    }
    setAuthSession(session);
    setAuthChecked(true);
  }, [router]);

  const handleLogout = useCallback(() => {
    clearSession();
    router.replace("/");
  }, [router]);

  // M3: AI extraction state
  const [aiExtractedData, setAiExtractedData] = useState<
    Partial<FinancialFields>
  >({});
  const [manuallyModifiedFields, setManuallyModifiedFields] = useState<
    (keyof FinancialFields)[]
  >([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  // A1: tone for the AI notice. "ok" = values were extracted (emerald +
  // Check is appropriate). "empty" = nothing was extracted — render
  // amber/neutral, never success styling.
  const [aiNoticeKind, setAiNoticeKind] = useState<"ok" | "empty">("ok");

  // B4: refs to read latest AI state inside clearExtractionState without
  // stale closures. These MUST be defined before any effect that calls
  // clearExtractionState so they fire first in a given render cycle.
  const aiExtractedDataRef = useRef<Partial<FinancialFields>>({});
  const manuallyModifiedFieldsRef = useRef<(keyof FinancialFields)[]>([]);

  // M6: request versioning + abort for stale AI responses.
  const aiRequestIdRef = useRef(0);
  const aiAbortRef = useRef<AbortController | null>(null);

  // Sync refs whenever the state changes.
  useEffect(() => {
    aiExtractedDataRef.current = aiExtractedData;
  }, [aiExtractedData]);

  useEffect(() => {
    manuallyModifiedFieldsRef.current = manuallyModifiedFields;
  }, [manuallyModifiedFields]);

  // M3 minor: abort in-flight analyze request and invalidate the request
  // version on unmount so a late response never writes to unmounted state.
  useEffect(() => {
    return () => {
      if (aiAbortRef.current) {
        aiAbortRef.current.abort();
        aiAbortRef.current = null;
      }
      aiRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBranchesLoading(true);
    loadBranches()
      .then((result) => {
        if (!cancelled) {
          setBranches(result);
          setBranchesError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setBranchesError(true);
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });

    try {
      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem(BRANCH_SESSION_KEY)
          : null;
      if (saved) {
        pendingBranchRestore.current = JSON.parse(saved) as SavedBranch;
      }
    } catch {
      // ignore parse errors
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      branches.length > 0 &&
      !selectedBranch &&
      pendingBranchRestore.current
    ) {
      const match = branches.find(
        (b) => b.id === pendingBranchRestore.current!.id,
      );
      if (match) {
        setSelectedBranch(match);
        setIsBranchLocked(true);
      }
      pendingBranchRestore.current = null;
    }
  }, [branches, selectedBranch]);

  // O1: single buffer — effectiveActualCash derives from fields.cashActualHanded,
  // which is kept in sync with rawValues.cashActualHanded by handleFieldChange.
  const effectiveActualCash = fields.cashActualHanded;

  useEffect(() => {
    setFields((prev) => ({
      ...prev,
      shortageOrExcess: computeShortageOrExcess(
        effectiveActualCash,
        prev.cashSystem,
      ),
    }));
  }, [effectiveActualCash, fields.cashSystem]);

  // B4: clear stale extraction state AND reset AI-origin field values
  // whenever the extraction identity changes (image, branch, date, closing).
  // Preserve any field the cashier manually modified; clear the rest.
  const clearExtractionState = useCallback(() => {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
    aiRequestIdRef.current += 1;

    const aiData = aiExtractedDataRef.current;
    const modified = manuallyModifiedFieldsRef.current;
    const aiKeys = Object.keys(aiData) as MonetaryKey[];

    if (aiKeys.length > 0) {
      setFields((prevFields) => {
        const next = { ...prevFields };
        for (const key of aiKeys) {
          if (!modified.includes(key)) {
            next[key] = 0;
          }
        }
        // O1: shortageOrExcess is owned by the effect above; do not
        // duplicate the assignment here.
        return next;
      });
      setRawValues((prevRaw) => {
        const next = { ...prevRaw };
        for (const key of aiKeys) {
          if (!modified.includes(key)) {
            next[key] = "";
          }
        }
        return next;
      });
      // Minor: clear stale parse errors for keys being reset so a field
      // does not keep a stale red border after AI state is cleared.
      setParseErrors((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const key of aiKeys) {
          if (!modified.includes(key)) {
            next.delete(key);
          }
        }
        return next;
      });
    }

    setAiExtractedData({});
    setManuallyModifiedFields([]);
    setAiAnalyzing(false);
    setAiError(null);
    setAiNotice(null);
    setAiNoticeKind("ok");
  }, []);

  useEffect(() => {
    clearExtractionState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch?.id]);

  useEffect(() => {
    clearExtractionState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessDate]);

  const handlePickBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    setIsBranchLocked(true);
    try {
      window.localStorage.setItem(
        BRANCH_SESSION_KEY,
        JSON.stringify({
          id: branch.id,
          name: branch.name,
        } satisfies SavedBranch),
      );
    } catch {
      // ignore quota / privacy errors
    }
  };

  const resetInputs = () => {
    setFields({ ...EMPTY_FINANCIAL_FIELDS });
    setRawValues({ ...EMPTY_RAW_VALUES });
    setUseManualCash(false);
    setParseErrors(new Set());
    setZReportImage(null);
    setProofImages([]);
    setSaveError(null);
    setWarnings([]);
    setClosingId(null);
    setSaveSource(null);
    clearExtractionState();
  };

  const handleConfirmBranchChange = () => {
    if (window.confirm(t(locale, "wizard.branch.changeConfirm"))) {
      setSelectedBranch(null);
      setIsBranchLocked(false);
      setStep(1);
      resetInputs();
      try {
        window.localStorage.removeItem(BRANCH_SESSION_KEY);
      } catch {
        // ignore
      }
    }
  };

  const handleStartNewClosing = () => {
    setStep(1);
    resetInputs();
  };

  // B2: update the raw string buffer and the parsed numeric state together.
  // The cashier sees exactly what they type; parsing happens on every
  // keystroke for live computation but the display is never reformatted.
  const handleFieldChange = (key: MonetaryKey, raw: string) => {
    if (
      Object.keys(aiExtractedData).length > 0 &&
      !manuallyModifiedFields.includes(key)
    ) {
      setManuallyModifiedFields((prev) => [...prev, key]);
    }
    setRawValues((prev) => ({ ...prev, [key]: raw }));
    const parsed = parseLocalizedNumber(raw);
    setFields((prev) => ({
      ...prev,
      [key]: parsed !== null ? coerceMonetary(parsed) : 0,
    }));
    // Minor: treat a lone "-" or "." as incomplete (no error), not invalid,
    // so the hint does not flash mid-typing.
    const trimmed = raw.trim();
    const isPartialInput = trimmed === "-" || trimmed === ".";
    setParseErrors((prev) => {
      const hasError =
        trimmed !== "" && parsed === null && !isPartialInput;
      if (hasError && !prev.has(key)) {
        const next = new Set(prev);
        next.add(key);
        return next;
      }
      if (!hasError && prev.has(key)) {
        const next = new Set(prev);
        next.delete(key);
        return next;
      }
      return prev;
    });
  };

  const onZReport = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      clearExtractionState();
      setZReportImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const onProofs = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setProofImages((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const handleAnalyzeImage = useCallback(async () => {
    if (!zReportImage) return;

    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const requestId = ++aiRequestIdRef.current;

    setAiAnalyzing(true);
    setAiError(null);
    setAiNotice(null);
    setAiNoticeKind("ok");
    try {
      const res = await fetch("/api/analyze-closing-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: zReportImage }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        /** F3 (R4): stable i18n key (wizard.ai.err.*) — prefer over `error`. */
        code?: string;
        fields?: Partial<FinancialFields>;
        finishReason?: string | null;
        model?: string;
      } | null;

      if (requestId !== aiRequestIdRef.current) return;

      if (!res.ok || !data) {
        // F3 (R4): prefer the stable `code` and translate it; fall back to
        // the server's Arabic string only when the code is missing/unknown;
        // generic bilingual key as the last resort.
        if (data?.code && hasTranslation(data.code)) {
          setAiError(t(locale, data.code));
        } else if (data?.error) {
          setAiError(data.error);
        } else {
          setAiError(t(locale, "wizard.ai.error"));
        }
        return;
      }

      const extracted: Partial<FinancialFields> = data.fields ?? {};

      // O2: Reconcile against prior extraction. Clear any key that was
      // AI-origin in the previous extraction but is absent from the new
      // one — unless the cashier manually modified it. This prevents
      // stale AI values from persisting with no badge and no way for
      // later clearing logic to identify them as AI-origin.
      const priorAiKeys = Object.keys(
        aiExtractedDataRef.current,
      ) as MonetaryKey[];
      const modified = [...manuallyModifiedFieldsRef.current];
      const staleKeys = priorAiKeys.filter(
        (k) => !(k in extracted) && !modified.includes(k),
      );

      setAiExtractedData(extracted);
      // Minor: retain manually-modified keys that are preserved under O2
      // (modified but absent from new extraction). Keys present in the new
      // extraction are freshly AI-set and should show the "ai" badge.
      const preservedModified = modified.filter(
        (k) => !(k in extracted),
      );
      setManuallyModifiedFields(preservedModified);
      setFields((prev) => {
        const next: FinancialFields = { ...prev };
        // O2: clear stale AI keys absent from new extraction.
        for (const key of staleKeys) {
          next[key] = 0;
        }
        // Apply new extraction values (overwrites stale clears where
        // the key is present in both).
        for (const key of AI_EXTRACTABLE_FIELDS) {
          const v = extracted[key];
          if (typeof v === "number" && Number.isFinite(v)) {
            next[key] = coerceMonetary(v);
          }
        }
        next.shortageOrExcess = computeShortageOrExcess(
          next.cashActualHanded,
          next.cashSystem,
        );
        return next;
      });
      // B2: also update raw string buffers so displayed values match.
      setRawValues((prev) => {
        const next = { ...prev };
        for (const key of staleKeys) {
          next[key] = "";
        }
        for (const key of AI_EXTRACTABLE_FIELDS) {
          const v = extracted[key];
          if (typeof v === "number" && Number.isFinite(v)) {
            // M3 minor: render AI-extracted 0 as "0" so the field
            // displays correctly instead of appearing empty.
            next[key] = String(coerceMonetary(v));
          }
        }
        return next;
      });
      // Minor: clear parse errors for keys overwritten or cleared by AI
      // so a field does not keep a stale red border after a correct value.
      setParseErrors((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const key of AI_EXTRACTABLE_FIELDS) {
          if (typeof extracted[key] === "number") {
            next.delete(key);
          }
        }
        for (const key of staleKeys) {
          next.delete(key);
        }
        return next;
      });
      const filled = AI_EXTRACTABLE_FIELDS.filter(
        (k) => typeof extracted[k] === "number",
      ).length;
      setAiNotice(
        filled > 0
          ? t(locale, "wizard.ai.filled", { filled })
          : t(locale, "wizard.ai.noValues"),
      );
      setAiNoticeKind(filled > 0 ? "ok" : "empty");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (requestId !== aiRequestIdRef.current) return;
      // F3 (R4): network/client-side failures carry no code — show the
      // generic bilingual key. No prose inspection.
      setAiError(t(locale, "wizard.ai.error"));
    } finally {
      if (requestId === aiRequestIdRef.current) {
        setAiAnalyzing(false);
        if (aiAbortRef.current === controller) aiAbortRef.current = null;
      }
    }
  }, [zReportImage, locale]);

  const badgeFor = (key: keyof FinancialFields): FieldBadge => {
    if (manuallyModifiedFields.includes(key)) return "manual";
    if (
      Object.keys(aiExtractedData).length > 0 &&
      typeof aiExtractedData[key] === "number"
    ) {
      return "ai";
    }
    return null;
  };

  const handleSave = useCallback(async () => {
    if (!selectedBranch) return;
    if (saving) return;
    // S1: block save while any field has an unparseable value.
    if (parseErrors.size > 0) {
      setSaveError(t(locale, "wizard.fixValues"));
      return;
    }

    setSaving(true);
    setSaveError(null);
    setWarnings([]);
    try {
      const dup = await checkDuplicateClosing(
        selectedBranch.id,
        businessDate,
      );
      if (dup) {
        const ok = window.confirm(t(locale, "wizard.duplicateConfirm"));
        if (!ok) {
          setSaving(false);
          return;
        }
      }

      const reviewedData: FinancialFields = {
        ...fields,
        shortageOrExcess: computeShortageOrExcess(
          effectiveActualCash,
          fields.cashSystem,
        ),
      };

      // O1: manualActualCash derives from the same single buffer
      // (rawValues.cashActualHanded). useManualCash controls only
      // whether this value is persisted as manual_actual_cash.
      const manualActualCash =
        useManualCash && rawValues.cashActualHanded !== ""
          ? coerceMonetary(parseLocalizedNumber(rawValues.cashActualHanded))
          : undefined;

      const result = await saveClosing({
        branchId: selectedBranch.id,
        businessDate,
        reviewedData,
        manualActualCash,
        zReportImageUrl: zReportImage ?? undefined,
        paymentProofImageUrls:
          proofImages.length > 0 ? proofImages : undefined,
        aiExtractedData:
          Object.keys(aiExtractedData).length > 0 ? aiExtractedData : undefined,
        manuallyModifiedFields:
          manuallyModifiedFields.length > 0
            ? manuallyModifiedFields
            : undefined,
      });
      setClosingId(result.closing.id);
      setSaveSource(result.source);
      setWarnings(result.warnings);
      setStep(3);
    } catch (e) {
      // F3 (R4): closings.ts cashier-path throws use i18n keys as
      // Error.message. Translate known keys; anything else is unexpected —
      // show the generic bilingual save error rather than raw prose.
      const message = e instanceof Error ? e.message : "";
      setSaveError(
        message && hasTranslation(message)
          ? t(locale, message)
          : t(locale, "wizard.saveError"),
      );
    } finally {
      setSaving(false);
    }
  }, [
    selectedBranch,
    businessDate,
    fields,
    useManualCash,
    rawValues,
    effectiveActualCash,
    zReportImage,
    proofImages,
    aiExtractedData,
    manuallyModifiedFields,
    saving,
    parseErrors,
    locale,
  ]);

  // M6: hold the wizard behind the session check so we never flash the
  // closing form to an unauthenticated visitor.
  if (!authChecked) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-slate-50 px-4"
        dir={dir}
      >
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span>{t(locale, "common.checkingSession")}</span>
        </div>
      </main>
    );
  }

  // M7: the locked session branch drives the dashboard (checklist storage
  // key, ticket branch_id). Falls back to the restored wizard branch only
  // if the session somehow lacks it.
  const dashboardBranchId = authSession?.branchId ?? selectedBranch?.id ?? null;
  const dashboardBranchName =
    authSession?.branchName ?? selectedBranch?.name ?? undefined;

  // F3 (R4): warnings are i18n keys, rendered via t(locale, key). The
  // offline card above already shows wizard.offlineNotice (same copy as
  // wizard.warn.offlineQueued) when saveSource === "local-queued" — filter
  // the duplicate key out of the list instead of showing it twice.
  const displayWarnings =
    saveSource === "local-queued"
      ? warnings.filter((w) => w !== "wizard.warn.offlineQueued")
      : warnings;

  // UX polish: tone for the shortage/excess block — rose shortage /
  // emerald excess / slate balanced. Purely derived, no state.
  const soe = fields.shortageOrExcess;
  const soeTone: "shortage" | "excess" | "balanced" =
    soe < 0 ? "shortage" : soe > 0 ? "excess" : "balanced";

  const stepsStatusText = t(locale, "wizard.steps.status", {
    current: step,
    total: 3,
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10" dir={dir}>
      {/* --------------------------------------------------------------
          M7 dashboard header — brand, locked branch, locale toggle,
          logout, and the IT ticket entry point. Touch targets ≥44px.
         -------------------------------------------------------------- */}
      <header className="card-frame mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 shadow-sm">
              <Store className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">
                {t(locale, "cashier.dashboard.title")}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
                <Lock className="h-3 w-3 shrink-0 text-emerald-600" />
                <span
                  dir="ltr"
                  className="font-semibold tracking-wide text-emerald-700"
                >
                  luxuryprep
                </span>
                {dashboardBranchId ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {dashboardBranchId}
                    {dashboardBranchName ? ` — ${dashboardBranchName}` : ""}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LocaleToggle locale={locale} onChange={handleLocaleChange} />
            <button
              type="button"
              onClick={() => setTicketOpen(true)}
              disabled={!dashboardBranchId}
              className={`${HEADER_ACTION_CLASS} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              {t(locale, "cashier.openTicket")}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className={`${HEADER_ACTION_CLASS} text-slate-500 hover:bg-rose-50 hover:text-rose-600`}
            >
              <LogOut className="h-3.5 w-3.5" />
              {t(locale, "common.logout")}
            </button>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------
          M7 prep dashboard — checklist + demo IT status in a compact,
          collapsible section (open by default) so it never buries the
          closing wizard below. No closing logic here.
         -------------------------------------------------------------- */}
      {dashboardBranchId ? (
        <details className="card-frame group mb-4" open>
          <summary className="flex min-h-11 cursor-pointer select-none list-none items-center justify-between gap-2 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ClipboardCheck className="h-4 w-4 text-emerald-600" />
              {t(locale, "cashier.prep.title")}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="border-t border-slate-100 bg-slate-50/60 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <PreCloseChecklist
                locale={locale}
                branchId={dashboardBranchId}
                businessDate={businessDate}
              />
              <ItStatusWidget locale={locale} />
            </div>
          </div>
        </details>
      ) : null}

      {/* --------------------------------------------------------------
          Closing wizard (M2–M6) — the PRIMARY job. Header band keeps it
          visually dominant; behavior unchanged below.
         -------------------------------------------------------------- */}
      <section className="card-frame overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <Calculator className="h-5 w-5" />
          </span>
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
            {t(locale, "wizard.title")}
          </h2>
        </div>

        <div className="p-5 sm:p-6">
          {/* Stepper — 44px chips, done steps get a check, connector
              fills as the cashier advances. R2: aria-label reuses the
              static wizard.title key (step count stays in the caption
              below) so screen readers get a stable landmark name. */}
          <nav className="mb-6" aria-label={t(locale, "wizard.title")}>
            <ol className="flex items-center gap-2 sm:gap-3">
              {([1, 2, 3] as const).map((s, i) => (
                <li
                  key={s}
                  className="flex flex-1 items-center gap-2 last:flex-none sm:gap-3"
                >
                  <span
                    aria-current={step === s ? "step" : undefined}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 ring-inset ${
                      step === s
                        ? "bg-emerald-600 text-white ring-emerald-600 shadow-sm"
                        : s < step
                          ? "bg-emerald-100 text-emerald-700 ring-emerald-600/20"
                          : "bg-slate-100 text-slate-400 ring-slate-200"
                    }`}
                  >
                    {s < step ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      s
                    )}
                  </span>
                  {i < 2 && (
                    <span
                      aria-hidden="true"
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        step > s ? "bg-emerald-500" : "bg-slate-200"
                      }`}
                    />
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-2.5 text-center text-xs font-medium text-slate-500">
              {stepsStatusText}
            </p>
          </nav>

          {/* Keyed wrapper replays the single step-change transition
              (.wizard-step-in, reduced-motion safe). All form state lives
              in this component, so the remount is safe. */}
          <div key={step} className="wizard-step-in">
            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-5">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t(locale, "wizard.step1.title")}
                </h3>
                {/* Branch */}
                <div>
                  <label
                    htmlFor="wizard-branch"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    {t(locale, "common.branch")}
                  </label>
                  {branchesLoading ? (
                    <div className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t(locale, "common.branchesLoading")}
                    </div>
                  ) : branchesError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{t(locale, "wizard.branchesError")}</span>
                    </div>
                  ) : !isBranchLocked ? (
                    <select
                      id="wizard-branch"
                      className={INPUT_CLASS}
                      value={selectedBranch?.id ?? ""}
                      onChange={(e) => {
                        const b = branches.find(
                          (x) => x.id === e.target.value,
                        );
                        if (b) handlePickBranch(b);
                      }}
                    >
                      <option value="">
                        {t(locale, "common.branchPlaceholder")}
                      </option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.id} — {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                        {selectedBranch?.id} — {selectedBranch?.name}
                      </span>
                      <button
                        type="button"
                        onClick={handleConfirmBranchChange}
                        className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                      >
                        {t(locale, "wizard.branch.change")}
                      </button>
                    </div>
                  )}
                </div>
                {/* Date */}
                <div>
                  <label
                    htmlFor="wizard-date"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    {t(locale, "wizard.date")}
                  </label>
                  <input
                    id="wizard-date"
                    type="date"
                    className={INPUT_CLASS}
                    value={businessDate}
                    onChange={(e) => setBusinessDate(e.target.value)}
                  />
                </div>
                {/* Z-Report image */}
                <div>
                  <label
                    htmlFor="wizard-zreport"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    {t(locale, "wizard.zreport")}
                  </label>
                  <input
                    id="wizard-zreport"
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES}
                    onChange={(e) => onZReport(e.target.files?.[0])}
                    className={FILE_INPUT_CLASS}
                  />
                  {zReportImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={zReportImage}
                      alt={t(locale, "wizard.zreport")}
                      className="mt-3 max-h-52 rounded-lg border border-slate-200 object-contain"
                    />
                  )}
                </div>
                {/* Payment proofs */}
                <div>
                  <label
                    htmlFor="wizard-proofs"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    {t(locale, "wizard.proofs")}
                  </label>
                  <input
                    id="wizard-proofs"
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES}
                    multiple
                    onChange={(e) => onProofs(e.target.files)}
                    className={FILE_INPUT_CLASS}
                  />
                  {proofImages.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {proofImages.map((img, i) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          key={i}
                          src={img}
                          alt={`${t(locale, "wizard.proofs")} ${i + 1}`}
                          className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`${PRIMARY_ACTION_CLASS} w-full`}
                  disabled={!selectedBranch || !businessDate}
                  onClick={() => setStep(2)}
                >
                  {t(locale, "common.next")}
                </button>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t(locale, "wizard.step2.title")}
                </h3>

                {/* M3: AI analysis panel — assistive, emerald-accented */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {t(locale, "wizard.ai.title")}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">
                        {t(locale, "wizard.ai.desc")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAnalyzeImage}
                    disabled={!zReportImage || aiAnalyzing}
                    className={`${AI_BUTTON_CLASS} mt-3`}
                  >
                    {aiAnalyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t(locale, "wizard.ai.analyzing")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        {t(locale, "wizard.ai.analyze")}
                      </>
                    )}
                  </button>
                  {!zReportImage && (
                    <p className="mt-2 text-xs text-slate-500">
                      {t(locale, "wizard.ai.noImage")}
                    </p>
                  )}
                  {/* A1: tone by outcome. "empty" (nothing extracted) is an
                      amber attention notice — emerald + Check is reserved
                      for the filled > 0 success notice. */}
                  {aiNotice &&
                    (aiNoticeKind === "empty" ? (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{aiNotice}</span>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 p-2 text-xs font-medium text-emerald-800">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{aiNotice}</span>
                      </div>
                    ))}
                  {aiError && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{aiError}</span>
                    </div>
                  )}
                </div>

                <NumberInput
                  locale={locale}
                  id="field-grossSales"
                  label={t(locale, "wizard.field.grossSales")}
                  value={rawValues.grossSales}
                  onChange={(v) => handleFieldChange("grossSales", v)}
                  badge={badgeFor("grossSales")}
                  error={parseErrors.has("grossSales")}
                />
                <NumberInput
                  locale={locale}
                  id="field-netSales"
                  label={t(locale, "wizard.field.netSales")}
                  value={rawValues.netSales}
                  onChange={(v) => handleFieldChange("netSales", v)}
                  badge={badgeFor("netSales")}
                  error={parseErrors.has("netSales")}
                />
                <NumberInput
                  locale={locale}
                  id="field-cashSystem"
                  label={t(locale, "wizard.field.cashSystem")}
                  value={rawValues.cashSystem}
                  onChange={(v) => handleFieldChange("cashSystem", v)}
                  badge={badgeFor("cashSystem")}
                  error={parseErrors.has("cashSystem")}
                />
                {/* O1: Manual actual cash uses the same rawValues.cashActualHanded
                    buffer as the non-manual path. useManualCash controls only the
                    label and whether manual_actual_cash is persisted on save. */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={useManualCash}
                      onChange={(e) => setUseManualCash(e.target.checked)}
                      className="h-5 w-5 shrink-0 accent-emerald-600"
                    />
                    {t(locale, "wizard.manualCash")}
                  </label>
                  <div className="mt-1">
                    {useManualCash ? (
                      <NumberInput
                        locale={locale}
                        id="field-cashActualHanded"
                        label={t(locale, "wizard.field.actualCash")}
                        value={rawValues.cashActualHanded}
                        onChange={(v) =>
                          handleFieldChange("cashActualHanded", v)
                        }
                        badge={badgeFor("cashActualHanded")}
                        error={parseErrors.has("cashActualHanded")}
                      />
                    ) : (
                      <NumberInput
                        locale={locale}
                        id="field-cashActualHanded"
                        label={t(locale, "wizard.field.cashHanded")}
                        value={rawValues.cashActualHanded}
                        onChange={(v) =>
                          handleFieldChange("cashActualHanded", v)
                        }
                        badge={badgeFor("cashActualHanded")}
                        error={parseErrors.has("cashActualHanded")}
                      />
                    )}
                  </div>
                </div>
                <NumberInput
                  locale={locale}
                  id="field-spanSystem"
                  label={t(locale, "wizard.field.span")}
                  value={rawValues.spanSystem}
                  onChange={(v) => handleFieldChange("spanSystem", v)}
                  badge={badgeFor("spanSystem")}
                  error={parseErrors.has("spanSystem")}
                />
                <NumberInput
                  locale={locale}
                  id="field-deliveryAppsSystem"
                  label={t(locale, "wizard.field.deliveryApps")}
                  value={rawValues.deliveryAppsSystem}
                  onChange={(v) => handleFieldChange("deliveryAppsSystem", v)}
                  badge={badgeFor("deliveryAppsSystem")}
                  error={parseErrors.has("deliveryAppsSystem")}
                />
                <NumberInput
                  locale={locale}
                  id="field-reversedTransactions"
                  label={t(locale, "wizard.field.reversals")}
                  value={rawValues.reversedTransactions}
                  onChange={(v) => handleFieldChange("reversedTransactions", v)}
                  badge={badgeFor("reversedTransactions")}
                  error={parseErrors.has("reversedTransactions")}
                />
                {/* Shortage/excess — high-contrast, impossible to miss:
                    rose shortage / emerald excess / slate balanced. */}
                <div
                  className={`rounded-xl border p-4 ${
                    soeTone === "shortage"
                      ? "border-rose-200 bg-rose-50"
                      : soeTone === "excess"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      {soeTone === "shortage" ? (
                        <TrendingDown
                          className="h-4 w-4 shrink-0 text-rose-600"
                          aria-hidden="true"
                        />
                      ) : soeTone === "excess" ? (
                        <TrendingUp
                          className="h-4 w-4 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                      ) : (
                        <Minus
                          className="h-4 w-4 shrink-0 text-slate-400"
                          aria-hidden="true"
                        />
                      )}
                      {t(locale, "wizard.field.shortageExcess")}
                    </span>
                    <span
                      dir="ltr"
                      className={`text-2xl font-bold tabular-nums ${
                        soeTone === "shortage"
                          ? "text-rose-700"
                          : soeTone === "excess"
                            ? "text-emerald-700"
                            : "text-slate-500"
                      }`}
                    >
                      {fields.shortageOrExcess.toFixed(2)}{" "}
                      {t(locale, "wizard.currency")}
                    </span>
                  </div>
                </div>
                {saveError && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{saveError}</span>
                  </div>
                )}
                {parseErrors.size > 0 && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-xs font-medium text-rose-700">
                    {t(locale, "wizard.fixValuesShort")}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    className={`${SECONDARY_ACTION_CLASS} flex-1`}
                    onClick={() => setStep(1)}
                  >
                    {t(locale, "common.back")}
                  </button>
                  <button
                    type="button"
                    className={`${PRIMARY_ACTION_CLASS} flex-1`}
                    disabled={saving || parseErrors.size > 0}
                    onClick={handleSave}
                  >
                    {saving
                      ? t(locale, "common.saving")
                      : t(locale, "wizard.save")}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && closingId && (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
                  <Check className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">
                  {t(locale, "wizard.success.title")}
                </h3>
                <p className="text-sm text-slate-600">
                  {t(locale, "wizard.success.id")}{" "}
                  <span
                    dir="ltr"
                    className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-800"
                  >
                    {closingId}
                  </span>
                </p>
                {saveSource === "local-queued" && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-start">
                    <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-sm font-medium text-amber-800">
                      {t(locale, "wizard.offlineNotice")}
                    </p>
                  </div>
                )}
                {displayWarnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-start">
                    <p className="mb-1 text-xs font-semibold text-amber-900">
                      {t(locale, "wizard.warnings")}
                    </p>
                    <ul className="list-disc space-y-1 ps-5 text-sm text-amber-800">
                      {displayWarnings.map((w, i) => (
                        <li key={i}>{t(locale, w)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {saveSource !== "local-queued" && displayWarnings.length === 0 && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-start">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-sm font-medium text-amber-800">
                      {t(locale, "wizard.awaiting")}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleStartNewClosing}
                    className={SECONDARY_ACTION_CLASS}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t(locale, "wizard.newClosing")}
                  </button>
                  <Link href="/" className={PRIMARY_ACTION_CLASS}>
                    {t(locale, "wizard.backToGateway")}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------
          M7: IT ticket modal — writes to public.it_support_tickets.
         -------------------------------------------------------------- */}
      {ticketOpen && dashboardBranchId ? (
        <ItTicketModal
          locale={locale}
          branchId={dashboardBranchId}
          branchName={dashboardBranchName}
          createdByRole={authSession?.role ?? "cashier"}
          onClose={() => setTicketOpen(false)}
        />
      ) : null}
    </main>
  );
}

function FieldBadgePill({
  locale,
  kind,
}: {
  locale: Locale;
  kind: "ai" | "manual";
}) {
  // R2 (Major): the "ai" badge is neutral slate — AI extraction is an
  // unverified suggestion, so it must not borrow the emerald "verified"
  // color reserved for shortage/excess results and save success.
  // "manual" keeps its amber "needs attention" tone.
  if (kind === "ai") {
    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
        {t(locale, "wizard.badge.ai")}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      {t(locale, "wizard.badge.manual")}
    </span>
  );
}

function NumberInput({
  locale,
  id,
  label,
  value,
  onChange,
  badge,
  error,
}: {
  locale: Locale;
  /** A2: stable caller-supplied id (e.g. "field-grossSales"). */
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  badge?: FieldBadge;
  error?: boolean;
}) {
  // A2: one id family ties the label (htmlFor), the input, and the
  // parse-error hint (aria-describedby) together for screen readers.
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700"
      >
        <span>{label}</span>
        {badge && <FieldBadgePill locale={locale} kind={badge} />}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        dir="ltr"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full min-h-11 rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:outline-none focus:ring-2 ${
          error
            ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
            : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p
          id={errorId}
          className="mt-1 text-xs font-medium text-rose-600"
        >
          {t(locale, "wizard.field.invalid")}
        </p>
      )}
    </div>
  );
}
