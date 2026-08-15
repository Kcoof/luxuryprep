"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calculator,
  Check,
  Loader2,
  Lock,
  LogOut,
  RotateCcw,
  Sparkles,
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
  const [step, setStep] = useState<Step>(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
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
          setBranchesError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setBranchesError("تعذّر تحميل قائمة الفروع");
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
    if (window.confirm("تغيير الفرع؟ سيتم فقدان البيانات المدخلة.")) {
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
    try {
      const res = await fetch("/api/analyze-closing-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: zReportImage }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        fields?: Partial<FinancialFields>;
        finishReason?: string | null;
        model?: string;
      } | null;

      if (requestId !== aiRequestIdRef.current) return;

      if (!res.ok || !data) {
        const msg =
          data?.error ?? "تعذّر تحليل الصورة. يُرجى إدخال البيانات يدويًا.";
        setAiError(msg);
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
          ? `تمت تعبئة ${filled} حقل من تحليل الصورة. يمكنك مراجعتها وتعديلها.`
          : "لم يستطع النموذج استخراج قيم واضحة. يُرجى الإدخال يدويًا.",
      );
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (requestId !== aiRequestIdRef.current) return;
      setAiError(
        e instanceof Error
          ? e.message
          : "تعذّر تحليل الصورة. يُرجى إدخال البيانات يدويًا.",
      );
    } finally {
      if (requestId === aiRequestIdRef.current) {
        setAiAnalyzing(false);
        if (aiAbortRef.current === controller) aiAbortRef.current = null;
      }
    }
  }, [zReportImage]);

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
      setSaveError("صحّح القيم غير الصحيحة قبل الحفظ.");
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
        const ok = window.confirm(
          "يوجد إقفال لهذا الفرع في هذا التاريخ. هل تريد المتابعة؟",
        );
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
      setSaveError(
        e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ",
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
  ]);

  // M6: hold the wizard behind the session check so we never flash the
  // closing form to an unauthenticated visitor.
  if (!authChecked) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-slate-50"
        dir="rtl"
      >
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">جارٍ التحقق من الجلسة…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-rose-600"
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </button>
        {authSession?.branchName ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            الجلسة: {authSession.branchName}
          </span>
        ) : null}
      </div>
      <div className="card-frame p-6">
        <div className="mb-6 flex items-center gap-3">
          <Calculator className="h-8 w-8 text-emerald-600" />
          <h1 className="text-2xl font-bold">شاشة الكاشير</h1>
        </div>
        <div className="mb-6 flex items-center justify-center gap-2">
          {([1, 2, 3] as const).map((s) => (
            <div
              key={s}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                step >= s
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">
              الخطوة ١: اختيار الفرع والتاريخ
            </h2>
            {/* Branch */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                الفرع
              </label>
              {branchesLoading ? (
                <p className="text-sm text-slate-500">جارٍ تحميل الفروع…</p>
              ) : branchesError ? (
                <p className="text-sm text-red-600">{branchesError}</p>
              ) : !isBranchLocked ? (
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={selectedBranch?.id ?? ""}
                  onChange={(e) => {
                    const b = branches.find(
                      (x) => x.id === e.target.value,
                    );
                    if (b) handlePickBranch(b);
                  }}
                >
                  <option value="">— اختر الفرع —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} — {b.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2">
                  <Lock className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium">
                    {selectedBranch?.id} — {selectedBranch?.name}
                  </span>
                  <button
                    type="button"
                    onClick={handleConfirmBranchChange}
                    className="mr-auto text-xs text-emerald-600 hover:underline"
                  >
                    تغيير الفرع
                  </button>
                </div>
              )}
            </div>
            {/* Date */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                تاريخ العمل
              </label>
              <input
                type="date"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
              />
            </div>
            {/* Z-Report image */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                صورة تقرير Z (اختياري)
              </label>
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={(e) => onZReport(e.target.files?.[0])}
                className="block w-full text-sm"
              />
              {zReportImage && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={zReportImage}
                  alt="Z-Report"
                  className="mt-2 max-h-48 rounded border"
                />
              )}
            </div>
            {/* Payment proofs */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                صور إثبات الدفع (اختياري)
              </label>
              <input
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                onChange={(e) => onProofs(e.target.files)}
                className="block w-full text-sm"
              />
              {proofImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {proofImages.map((img, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={i}
                      src={img}
                      alt={`Proof ${i + 1}`}
                      className="h-24 rounded border"
                    />
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              disabled={!selectedBranch || !businessDate}
              onClick={() => setStep(2)}
            >
              التالي
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              الخطوة ٢: البيانات المالية
            </h2>

            {/* M3: AI analysis button */}
            <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <span className="text-sm font-medium text-violet-900">
                  تحليل بالذكاء الاصطناعي
                </span>
              </div>
              <p className="mt-1 text-xs text-violet-800">
                يستخرج القيم من صورة تقرير Z تلقائيًا. يمكنك دائمًا تعديل أي قيمة بعد الاستخراج.
              </p>
              <button
                type="button"
                onClick={handleAnalyzeImage}
                disabled={!zReportImage || aiAnalyzing}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {aiAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ التحليل…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    تحليل صورة تقرير Z
                  </>
                )}
              </button>
              {!zReportImage && (
                <p className="mt-1 text-xs text-violet-700">
                  عُد للخطوة السابقة لرفع صورة تقرير Z أولًا.
                </p>
              )}
              {aiNotice && (
                <p className="mt-2 text-xs font-medium text-violet-900">
                  {aiNotice}
                </p>
              )}
              {aiError && (
                <div className="mt-2 flex items-start gap-2 rounded bg-red-50 p-2 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}
            </div>

            <NumberInput
              label="إجمالي المبيعات"
              value={rawValues.grossSales}
              onChange={(v) => handleFieldChange("grossSales", v)}
              badge={badgeFor("grossSales")}
              error={parseErrors.has("grossSales")}
            />
            <NumberInput
              label="صافي المبيعات"
              value={rawValues.netSales}
              onChange={(v) => handleFieldChange("netSales", v)}
              badge={badgeFor("netSales")}
              error={parseErrors.has("netSales")}
            />
            <NumberInput
              label="النقدية حسب النظام"
              value={rawValues.cashSystem}
              onChange={(v) => handleFieldChange("cashSystem", v)}
              badge={badgeFor("cashSystem")}
              error={parseErrors.has("cashSystem")}
            />
            {/* O1: Manual actual cash uses the same rawValues.cashActualHanded
                buffer as the non-manual path. useManualCash controls only the
                label and whether manual_actual_cash is persisted on save. */}
            <div className="rounded-md border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={useManualCash}
                  onChange={(e) => setUseManualCash(e.target.checked)}
                />
                إدخال النقدية الفعلية يدويًا
              </label>
              {useManualCash ? (
                <NumberInput
                  label="النقدية الفعلية"
                  value={rawValues.cashActualHanded}
                  onChange={(v) => handleFieldChange("cashActualHanded", v)}
                  badge={badgeFor("cashActualHanded")}
                  error={parseErrors.has("cashActualHanded")}
                />
              ) : (
                <div className="mt-2">
                  <NumberInput
                    label="النقدية المسلّمة"
                    value={rawValues.cashActualHanded}
                    onChange={(v) => handleFieldChange("cashActualHanded", v)}
                    badge={badgeFor("cashActualHanded")}
                    error={parseErrors.has("cashActualHanded")}
                  />
                </div>
              )}
            </div>
            <NumberInput
              label="سبان"
              value={rawValues.spanSystem}
              onChange={(v) => handleFieldChange("spanSystem", v)}
              badge={badgeFor("spanSystem")}
              error={parseErrors.has("spanSystem")}
            />
            <NumberInput
              label="تطبيقات التوصيل"
              value={rawValues.deliveryAppsSystem}
              onChange={(v) => handleFieldChange("deliveryAppsSystem", v)}
              badge={badgeFor("deliveryAppsSystem")}
              error={parseErrors.has("deliveryAppsSystem")}
            />
            <NumberInput
              label="حركات مرتجعة"
              value={rawValues.reversedTransactions}
              onChange={(v) => handleFieldChange("reversedTransactions", v)}
              badge={badgeFor("reversedTransactions")}
              error={parseErrors.has("reversedTransactions")}
            />
            {/* Shortage/excess display */}
            <div className="rounded-md bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  العجز / الزيادة
                </span>
                <span
                  className={`text-lg font-bold ${
                    fields.shortageOrExcess < 0
                      ? "text-red-600"
                      : fields.shortageOrExcess > 0
                        ? "text-emerald-600"
                        : "text-slate-500"
                  }`}
                >
                  {fields.shortageOrExcess.toFixed(2)} ر.س
                </span>
              </div>
            </div>
            {saveError && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {saveError}
              </div>
            )}
            {parseErrors.size > 0 && (
              <p className="text-center text-xs text-red-600">
                صحّح القيم غير الصحيحة قبل الحفظ
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setStep(1)}
              >
                السابق
              </button>
              <button
                type="button"
                className="flex-1 rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={saving || parseErrors.size > 0}
                onClick={handleSave}
              >
                {saving ? "جارٍ الحفظ…" : "حفظ الإقفال"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && closingId && (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold">تم إنشاء الإقفال</h2>
            <p className="text-sm text-slate-600">
              رقم الإقفال:{" "}
              <span className="font-mono font-bold">{closingId}</span>
            </p>
            {saveSource === "local-queued" && (
              <div className="rounded-md bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  تم الحفظ محليًا (وضع عدم الاتصال). يُرجى إعادة الإرسال يدويًا عند توفّر الاتصال.
                </p>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="rounded-md bg-amber-50 p-3 text-right">
                <p className="mb-1 text-xs font-semibold text-amber-900">
                  تنبيهات:
                </p>
                <ul className="space-y-1 text-sm text-amber-800">
                  {warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
            {saveSource !== "local-queued" && warnings.length === 0 && (
              <div className="rounded-md bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  بانتظار اعتماد الإدارة المالية
                </p>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={handleStartNewClosing}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" />
                بدء إقفال جديد
              </button>
              <Link
                href="/"
                className="inline-block rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
              >
                العودة للبوابة
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function FieldBadgePill({ kind }: { kind: "ai" | "manual" }) {
  if (kind === "ai") {
    return (
      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
        ذكاء اصطناعي
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
      معدّل يدويًا
    </span>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  badge,
  error,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  badge?: FieldBadge;
  error?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
        <span>{label}</span>
        {badge && <FieldBadgePill kind={badge} />}
      </label>
      <input
        type="text"
        inputMode="decimal"
        className={`w-full rounded-md border px-3 py-2 text-sm ${
          error ? "border-red-400" : "border-slate-300"
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p className="mt-1 text-xs text-red-600">
          قيمة غير صحيحة
        </p>
      )}
    </div>
  );
}