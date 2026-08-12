"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Check,
  Lock,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Loader2,
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

type Step = 1 | 2 | 3;

const BRANCH_SESSION_KEY = "cashier_selected_branch";

interface SavedBranch {
  id: string;
  name: string;
}

const AI_EXTRACTABLE_FIELDS: (keyof FinancialFields)[] = [
  "grossSales",
  "netSales",
  "cashSystem",
  "cashActualHanded",
  "spanSystem",
  "deliveryAppsSystem",
  "reversedTransactions",
];

type FieldBadge = "ai" | "manual" | null;

/**
 * M3 (M8): parse localized monetary input safely.
 * - Maps Arabic-Indic digits ٠-٩ and Eastern Arabic ۰-۹ to 0-9.
 * - Maps Arabic decimal separators (٫ / ،) and whitespace to ASCII dot/comma.
 * - Strips thousands separators (commas, spaces, the Arabic thousand mark).
 * - Returns null when the cleaned input is empty or non-numeric.
 */
function parseLocalizedNumber(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066b\u060c]/g, ",")
    .replace(/[\u066c]/g, " ")
    .replace(/[\u2009\u202f]/g, " ");

  // Collapse multiple spaces and trim.
  const collapsed = normalized.replace(/\s+/g, " ").trim();
  if (collapsed === "" || collapsed === "-" || collapsed === ".") return null;

  // Decimal separator: pick the rightmost '.' or ',' as decimal, drop the rest.
  const lastDot = collapsed.lastIndexOf(".");
  const lastComma = collapsed.lastIndexOf(",");
  let decimalIdx = -1;
  let working = collapsed;
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) {
      // dot is decimal -> commas are thousands
      decimalIdx = lastDot;
      working = collapsed.replace(/,/g, "");
    } else {
      // comma is decimal -> dots are thousands
      decimalIdx = lastComma;
      working = collapsed.replace(/\./g, "");
    }
  } else if (lastComma >= 0) {
    // Only commas present. Treat as thousands if there are multiple or if the
    // single comma is followed by exactly 3 digits at end and another digit
    // precedes; otherwise treat as decimal.
    const count = (collapsed.match(/,/g) ?? []).length;
    const tail = collapsed.slice(lastComma + 1);
    if (count > 1 || (tail.length === 3 && /^\d+$/.test(tail))) {
      working = collapsed.replace(/,/g, "");
    } else {
      decimalIdx = lastComma;
      working = collapsed.replace(/,/g, ".");
    }
  } else {
    // Only dots (or none). Strip spaces used as thousands separators.
    working = collapsed.replace(/ /g, "");
  }

  if (decimalIdx >= 0) {
    // Normalize decimal separator to '.'.
    working = working.replace(/\./g, "").replace(/,/g, ".");
  } else {
    working = working.replace(/ /g, "");
  }

  // Remove any remaining non-numeric characters except sign and dot.
  working = working.replace(/[^\d.\-]/g, "");

  if (working === "" || working === "-" || working === ".") return null;
  const n = Number(working);
  return Number.isFinite(n) ? n : null;
}

function coerceMonetary(n: number | null): number {
  if (n === null || !Number.isFinite(n)) return 0;
  // Validate monetary precision (2 decimals, non-NaN, bounded).
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(rounded)) return 0;
  if (Math.abs(rounded) > 1e12) return 0;
  return rounded;
}

function todayInRiyadh(): string {
  // M3 (M7): Saudi Arabia is UTC+3. Compute the business date in Asia/Riyadh
  // explicitly so a late-night close (00:00–03:00 local) is not attributed to
  // the previous UTC day.
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date());
  } catch {
    // Fallback (extremely old runtimes): apply +3h offset manually.
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
  const [manualActualCashRaw, setManualActualCashRaw] = useState("");
  const [useManualCash, setUseManualCash] = useState(false);
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

  // M3 (M6): request versioning + abort for stale AI responses.
  const aiRequestIdRef = useRef(0);
  const aiAbortRef = useRef<AbortController | null>(null);

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

    // Restore previously selected branch from localStorage (Major #5)
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

  // Once branches are loaded, re-lock to the saved branch (if any).
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

  const manualActualCashValue = (() => {
    if (!useManualCash || manualActualCashRaw === "") return null;
    return parseLocalizedNumber(manualActualCashRaw);
  })();

  const effectiveActualCash =
    manualActualCashValue !== null
      ? coerceMonetary(manualActualCashValue)
      : fields.cashActualHanded;

  useEffect(() => {
    setFields((prev) => ({
      ...prev,
      shortageOrExcess: computeShortageOrExcess(
        effectiveActualCash,
        prev.cashSystem,
      ),
    }));
  }, [effectiveActualCash, fields.cashSystem]);

  // M3 (M6): clear stale extraction state whenever the image, branch, or
  // closing identity changes — a previous AI result must not bleed into a
  // different closing.
  const clearExtractionState = useCallback(() => {
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
    aiRequestIdRef.current += 1; // invalidate any in-flight response
    setAiExtractedData({});
    setManuallyModifiedFields([]);
    setAiAnalyzing(false);
    setAiError(null);
    setAiNotice(null);
  }, []);

  // Whenever the branch changes (incl. lock/unlock), drop extraction state.
  useEffect(() => {
    clearExtractionState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch?.id]);

  // Whenever the business date changes, drop extraction state.
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
    setManualActualCashRaw("");
    setUseManualCash(false);
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
    // Keep the currently selected branch locked for convenience
  };

  const setField = (key: keyof FinancialFields, raw: string) => {
    // M3: if AI extraction has populated data and the cashier edits a field,
    // record it as manually modified.
    if (
      Object.keys(aiExtractedData).length > 0 &&
      !manuallyModifiedFields.includes(key)
    ) {
      setManuallyModifiedFields((prev) => [...prev, key]);
    }
    const parsed = parseLocalizedNumber(raw);
    if (parsed === null) {
      // Treat empty / unparseable as 0 to keep numeric invariants.
      setFields((prev) => ({ ...prev, [key]: 0 }));
      return;
    }
    const n = coerceMonetary(parsed);
    setFields((prev) => ({ ...prev, [key]: n }));
  };

  const displayValue = (v: number) => (v === 0 ? "" : String(v));

  const onZReport = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Changing the image invalidates any prior extraction.
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

    // M3 (M6): cancel any previous in-flight request and version this one.
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

      // Stale response: the image, branch, or closing changed mid-flight.
      if (requestId !== aiRequestIdRef.current) return;

      if (!res.ok || !data) {
        const msg =
          data?.error ?? "تعذّر تحليل الصورة. يُرجى إدخال البيانات يدويًا.";
        setAiError(msg);
        return;
      }

      const extracted: Partial<FinancialFields> = data.fields ?? {};
      setAiExtractedData(extracted);
      setManuallyModifiedFields([]);
      setFields((prev) => {
        const next: FinancialFields = { ...prev };
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
    if (saving) return; // M3 (M6): double-submit guard

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

      // M3 (M8): normalize all monetary fields before persisting.
      const reviewedData: FinancialFields = {
        ...fields,
        shortageOrExcess: computeShortageOrExcess(
          effectiveActualCash,
          fields.cashSystem,
        ),
      };

      const manualActualCash =
        useManualCash && manualActualCashRaw !== ""
          ? coerceMonetary(parseLocalizedNumber(manualActualCashRaw))
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
    manualActualCashRaw,
    effectiveActualCash,
    zReportImage,
    proofImages,
    aiExtractedData,
    manuallyModifiedFields,
    saving,
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowRight className="h-4 w-4" />
        العودة للرئيسية
      </Link>
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
                accept="image/*"
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
                accept="image/*"
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
              value={displayValue(fields.grossSales)}
              onChange={(v) => setField("grossSales", v)}
              badge={badgeFor("grossSales")}
            />
            <NumberInput
              label="صافي المبيعات"
              value={displayValue(fields.netSales)}
              onChange={(v) => setField("netSales", v)}
              badge={badgeFor("netSales")}
            />
            <NumberInput
              label="النقدية حسب النظام"
              value={displayValue(fields.cashSystem)}
              onChange={(v) => setField("cashSystem", v)}
              badge={badgeFor("cashSystem")}
            />
            {/* Manual actual cash */}
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
                  value={manualActualCashRaw}
                  onChange={(v) => {
                    // M3 (Minor): route through setField so a manual override
                    // of an AI-extracted cashActualHanded is recorded in the
                    // provenance set.
                    setManualActualCashRaw(v);
                    setField("cashActualHanded", v);
                  }}
                  badge={badgeFor("cashActualHanded")}
                />
              ) : (
                <div className="mt-2">
                  <NumberInput
                    label="النقدية المسلّمة"
                    value={displayValue(fields.cashActualHanded)}
                    onChange={(v) => setField("cashActualHanded", v)}
                    badge={badgeFor("cashActualHanded")}
                  />
                </div>
              )}
            </div>
            <NumberInput
              label="سبان"
              value={displayValue(fields.spanSystem)}
              onChange={(v) => setField("spanSystem", v)}
              badge={badgeFor("spanSystem")}
            />
            <NumberInput
              label="تطبيقات التوصيل"
              value={displayValue(fields.deliveryAppsSystem)}
              onChange={(v) => setField("deliveryAppsSystem", v)}
              badge={badgeFor("deliveryAppsSystem")}
            />
            <NumberInput
              label="حركات مرتجعة"
              value={displayValue(fields.reversedTransactions)}
              onChange={(v) => setField("reversedTransactions", v)}
              badge={badgeFor("reversedTransactions")}
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
                disabled={saving}
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
                العودة للرئيسية
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
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  badge?: FieldBadge;
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
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}