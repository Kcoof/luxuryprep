"use client";

// M7 — cashier branch screen (luxuryprep, bilingual AR/EN).
// Home restyle (Pulse-like layout, luxuryprep brand): full-bleed emerald
// header with greeting + branch + date/time, a centered question, a 2×2
// status-card grid (checklist progress / Foodics / Mada / IT ticket),
// and a full-width primary daily-closing card that scrolls to the wizard.
// The M2–M6 wizard logic (branch lock, duplicate guard, AI extraction
// with abort/versioning, save/offline queue) is UNCHANGED — presentation
// only.
//
// Step 1 restyle (Pulse-like): green instruction banner, two columns on
// md+ — Col A basic report data (locked branch, business date, optional
// actual cash handed) and Col B uploads (Foodics Z-report dropzone +
// three separate payment-proof slots: Mada / Cash / Visa, one image
// each, optional). Proof state is madaProof / cashProof / visaProof
// (string | null); on save they assemble into paymentProofImageUrls in
// stable order [mada, cash, visa]. No DB migration.
//
// F3 (R4): runtime messages use stable codes end-to-end. The analyze API
// returns a `code` equal to an i18n key; closings.ts warnings ARE i18n
// keys and its cashier-path throws use keys as Error.message. This page
// translates via t(locale, code) + hasTranslation() — no prose matching.
//
// UX batch (Part A): AI "no values extracted" notice renders amber/neutral
// (aiNoticeKind === "empty"); emerald + Check reserved for filled > 0.
// A2: NumberInput takes a stable caller-supplied `id` with htmlFor +
// aria-describedby wiring.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Banknote,
  Calculator,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  ImagePlus,
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
  ItStatusCard,
  ItTicketModal,
  PreCloseChecklistCard,
  demoItState,
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
// Shared class tokens (min-h-11 touch targets, restrained focus rings,
// logical props).
// ----------------------------------------------------------------------

const INPUT_CLASS =
  "w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const PRIMARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:pointer-events-none disabled:opacity-50";

// Light controls on the emerald header.
const HEADER_ACTION_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-semibold text-emerald-50 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-50";

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
      intPart = s.slice(0, lastDot).replace(/,/g, "");
      fracPart = s.slice(lastDot + 1);
    } else {
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

// Home header helpers — greeting bucket + live date/time string, both in
// the active locale, computed in Asia/Riyadh. Purely presentational.
function greetingKeyFor(hour: number): string {
  if (hour < 12) return "cashier.home.greetingMorning";
  if (hour < 17) return "cashier.home.greetingAfternoon";
  return "cashier.home.greetingEvening";
}

function headerDateTime(locale: Locale, now: Date): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
      timeZone: "Asia/Riyadh",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: locale === "en",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 16).replace("T", " ");
  }
}

function riyadhHour(now: Date): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Riyadh",
        hour: "numeric",
        hour12: false,
      }).format(now),
    );
  } catch {
    return now.getUTCHours() + 3;
  }
}

// ----------------------------------------------------------------------
// Step 1 presentational slots — upload cards shared by the Z-report
// dropzone and the three payment-proof slots. One image per slot.
// ----------------------------------------------------------------------

interface ProofSlotTheme {
  chip: string;
  border: string;
  ring: string;
}

const PROOF_THEMES: Record<"mada" | "cash" | "visa", ProofSlotTheme> = {
  mada: {
    chip: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
    border: "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/60",
    ring: "focus-visible:ring-emerald-600/40",
  },
  cash: {
    chip: "bg-amber-100 text-amber-700 ring-amber-600/20",
    border: "border-amber-200 hover:border-amber-400 hover:bg-amber-50/60",
    ring: "focus-visible:ring-amber-600/40",
  },
  visa: {
    chip: "bg-sky-100 text-sky-700 ring-sky-600/20",
    border: "border-sky-200 hover:border-sky-400 hover:bg-sky-50/60",
    ring: "focus-visible:ring-sky-600/40",
  },
};

/** One payment-proof slot: icon chip, dashed picker or captured preview. */
function ProofSlot({
  locale,
  slot,
  label,
  image,
  onPick,
  onClear,
}: {
  locale: Locale;
  slot: "mada" | "cash" | "visa";
  label: string;
  image: string | null;
  onPick: (file?: File) => void;
  onClear: () => void;
}) {
  const theme = PROOF_THEMES[slot];
  const inputId = `wizard-proof-${slot}`;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="flex items-center gap-2 text-sm font-medium text-slate-700"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset ${theme.chip}`}
          >
            {slot === "mada" ? (
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            ) : slot === "cash" ? (
              <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </span>
          {label}
        </label>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {t(locale, "wizard.step1.optional")}
        </span>
      </div>
      {image ? (
        <div
          className={`rounded-xl border p-2 ${theme.border.replace("hover:border", "border")}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={label}
            className="h-28 w-full rounded-lg object-cover"
          />
          <button
            type="button"
            onClick={onClear}
            className={`mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 ${theme.ring}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t(locale, "wizard.step1.replace")}
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs font-medium text-slate-500 transition-colors focus-visible:outline-none focus-visible:ring-2 ${theme.border} ${theme.ring}`}
        >
          <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(locale, "wizard.step1.addImage")}
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="sr-only"
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
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

  // Home header clock — refreshes each minute; no closing logic.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // M7: IT ticket modal state.
  const [ticketOpen, setTicketOpen] = useState(false);

  // Scroll target for the primary daily-closing card CTA.
  const wizardRef = useRef<HTMLDivElement>(null);

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
  // Step 1 restyle: three separate single-image proof slots (one image
  // each, all optional). On save they assemble into
  // paymentProofImageUrls in stable order [mada, cash, visa].
  const [madaProof, setMadaProof] = useState<string | null>(null);
  const [cashProof, setCashProof] = useState<string | null>(null);
  const [visaProof, setVisaProof] = useState<string | null>(null);
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
    setMadaProof(null);
    setCashProof(null);
    setVisaProof(null);
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

  // Step 1 restyle: single-image proof slot setter (one file per slot).
  const onProofSlot = (
    file: File | undefined,
    setter: (v: string | null) => void,
  ) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
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

      // Step 1 restyle: assemble the three proof slots in stable order
      // [mada, cash, visa] — filter(Boolean) keeps the relative order.
      const paymentProofs = [madaProof, cashProof, visaProof].filter(
        (v): v is string => typeof v === "string" && v !== "",
      );

      const result = await saveClosing({
        branchId: selectedBranch.id,
        businessDate,
        reviewedData,
        manualActualCash,
        zReportImageUrl: zReportImage ?? undefined,
        paymentProofImageUrls:
          paymentProofs.length > 0 ? paymentProofs : undefined,
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
    madaProof,
    cashProof,
    visaProof,
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

  const scrollToWizard = () => {
    wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-10" dir={dir}>
      {/* --------------------------------------------------------------
          Home header — full-bleed emerald band (Pulse-like layout, still
          luxuryprep brand): time-of-day greeting, locked branch, live
          date/time chip, wordmark + Store icon, light logout controls.
         -------------------------------------------------------------- */}
      <header className="bg-emerald-800 px-4 pb-6 pt-5 text-white sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-emerald-50 ring-1 ring-white/25">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-100">
                  {t(locale, greetingKeyFor(riyadhHour(now)))}
                </p>
                <h1 className="mt-0.5 truncate text-lg font-bold">
                  {dashboardBranchName ?? t(locale, "cashier.dashboard.title")}
                </h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-200">
                  <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span
                    dir="ltr"
                    className="font-semibold tracking-wide text-emerald-100"
                  >
                    luxuryprep
                  </span>
                  {dashboardBranchId ? (
                    <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 font-medium text-emerald-50">
                      {dashboardBranchId}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle locale={locale} onChange={handleLocaleChange} />
              <button
                type="button"
                onClick={handleLogout}
                className={HEADER_ACTION_CLASS}
              >
                <LogOut className="h-3.5 w-3.5" />
                {t(locale, "common.logout")}
              </button>
            </div>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-emerald-50 ring-1 ring-white/20">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {headerDateTime(locale, now)}
          </div>
        </div>
      </header>

      {/* Centered question + status card grid */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="-mt-3 translate-y-[-1.5rem] sm:-mt-4" />
        <section className="pt-5">
          <h2 className="text-center text-base font-bold text-slate-900 sm:text-lg">
            {t(locale, "cashier.home.question")}
          </h2>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Card A — pre-close checklist progress */}
            {dashboardBranchId ? (
              <PreCloseChecklistCard
                locale={locale}
                branchId={dashboardBranchId}
                businessDate={businessDate}
              />
            ) : null}

            {/* Card B — Foodics (demo status) */}
            <ItStatusCard
              locale={locale}
              labelKey="cashier.itstatus.foodics"
              state={demoItState("cashier.itstatus.foodics")}
            />

            {/* Card C — Mada (demo status) */}
            <ItStatusCard
              locale={locale}
              labelKey="cashier.itstatus.mada"
              state={demoItState("cashier.itstatus.mada")}
            />

            {/* Card D — IT ticket */}
            <button
              type="button"
              onClick={() => setTicketOpen(true)}
              disabled={!dashboardBranchId}
              className="card-frame flex min-h-[7.5rem] flex-col items-start gap-2 p-4 text-start transition-colors hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-600/20">
                <LifeBuoy className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {t(locale, "cashier.home.card.it.title")}
              </span>
              <span className="text-xs text-slate-500">
                {t(locale, "cashier.home.card.it.cta")}
              </span>
            </button>
          </div>
        </section>

        {/* ------------------------------------------------------------
            Primary daily-closing card — scrolls to the wizard below.
           ------------------------------------------------------------ */}
        <button
          type="button"
          onClick={scrollToWizard}
          className="card-frame mt-4 flex w-full items-center gap-4 p-4 text-start transition-colors hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
            <Calculator className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900 sm:text-base">
              {t(locale, "cashier.home.closing.title")}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500 sm:text-sm">
              {t(locale, "cashier.home.closing.subtitle")}
            </span>
          </span>
          <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
            {t(locale, "cashier.home.closing.cta")}
          </span>
        </button>

        {/* ------------------------------------------------------------
            Closing wizard (M2–M6) — the PRIMARY job. Behavior unchanged.
           ------------------------------------------------------------ */}
        <div ref={wizardRef} className="scroll-mt-4 pt-5">
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
                  (.wizard-step-in, reduced-motion safe). All form state
                  lives in this component, so the remount is safe. */}
              <div key={step} className="wizard-step-in">
                {/* Step 1 — Pulse-like restyle: green instruction banner,
                    two columns on md+ (basic data | uploads), full-width
                    analyze-and-continue CTA. */}
                {step === 1 && (
                  <div className="space-y-5">
                    {/* Green instruction banner — short bilingual tip */}
                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                      <Sparkles
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{t(locale, "wizard.step1.tip")}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      {/* Col A — (1) Basic report data */}
                      <div className="space-y-4">
                        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                            1
                          </span>
                          {t(locale, "wizard.step1.basicTitle")}
                        </h3>

                        {/* Branch (locked badge / picker) */}
                        <div>
                          <label
                            htmlFor={
                              isBranchLocked && selectedBranch
                                ? undefined
                                : "wizard-branch"
                            }
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
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5">
                              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                <Lock className="h-4 w-4 shrink-0 text-emerald-600" />
                                {selectedBranch?.id} — {selectedBranch?.name}
                              </span>
                              <button
                                type="button"
                                onClick={handleConfirmBranchChange}
                                className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                              >
                                {t(locale, "wizard.branch.change")}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Business date */}
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

                        {/* Optional actual cash handed (SAR) — same
                            rawValues buffer step 2 uses; optional here. */}
                        <NumberInput
                          locale={locale}
                          id="field-cashActualHanded-step1"
                          label={t(locale, "wizard.step1.cashHanded")}
                          value={rawValues.cashActualHanded}
                          onChange={(v) =>
                            handleFieldChange("cashActualHanded", v)
                          }
                          badge={badgeFor("cashActualHanded")}
                          error={parseErrors.has("cashActualHanded")}
                        />
                      </div>

                      {/* Col B — uploads */}
                      <div className="space-y-4">
                        {/* (2) Foodics Z-report — large dashed dropzone */}
                        <div>
                          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                              2
                            </span>
                            {t(locale, "wizard.step1.zreportTitle")}
                          </h3>
                          <label
                            htmlFor="wizard-zreport"
                            className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-4 py-7 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                          >
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              <ImagePlus
                                className="h-5 w-5"
                                aria-hidden="true"
                              />
                            </span>
                            <span className="text-sm font-semibold text-slate-800">
                              {t(locale, "wizard.step1.zreportDrop")}
                            </span>
                            <span className="text-xs text-slate-500">
                              {t(locale, "wizard.step1.zreportHint")}
                            </span>
                          </label>
                          <input
                            id="wizard-zreport"
                            type="file"
                            accept={ACCEPTED_IMAGE_TYPES}
                            className="sr-only"
                            onChange={(e) => {
                              onZReport(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                          {zReportImage && (
                            <div className="mt-2.5 rounded-xl border border-slate-200 p-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={zReportImage}
                                alt={t(locale, "wizard.zreport")}
                                className="max-h-44 w-full rounded-lg object-contain"
                              />
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                                  <Check
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  {t(locale, "wizard.step1.attached")}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setZReportImage(null)}
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                                >
                                  <RotateCcw
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  {t(locale, "wizard.step1.replace")}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* (3) Payment proofs — three separate optional
                            slots: Mada / Cash / Visa, one image each. */}
                        <div>
                          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                              3
                            </span>
                            {t(locale, "wizard.step1.proofsTitle")}
                          </h3>
                          <div className="mt-2 space-y-3">
                            <ProofSlot
                              locale={locale}
                              slot="mada"
                              label={t(locale, "wizard.step1.proofMada")}
                              image={madaProof}
                              onPick={(f) => onProofSlot(f, setMadaProof)}
                              onClear={() => setMadaProof(null)}
                            />
                            <ProofSlot
                              locale={locale}
                              slot="cash"
                              label={t(locale, "wizard.step1.proofCash")}
                              image={cashProof}
                              onPick={(f) => onProofSlot(f, setCashProof)}
                              onClear={() => setCashProof(null)}
                            />
                            <ProofSlot
                              locale={locale}
                              slot="visa"
                              label={t(locale, "wizard.step1.proofVisa")}
                              image={visaProof}
                              onPick={(f) => onProofSlot(f, setVisaProof)}
                              onClear={() => setVisaProof(null)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Full-width CTA — advance to confirmation (analyze
                        stays on step 2, existing behavior unchanged). */}
                    <button
                      type="button"
                      className={`${PRIMARY_ACTION_CLASS} w-full`}
                      disabled={!selectedBranch || !businessDate}
                      onClick={() => setStep(2)}
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      {t(locale, "wizard.step1.cta")}
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
                      {/* A1: tone by outcome. "empty" (nothing extracted) is
                          an amber attention notice — emerald + Check is
                          reserved for the filled > 0 success notice. */}
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
        </div>
      </div>

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

