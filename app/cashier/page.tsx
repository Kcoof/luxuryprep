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

export default function CashierPage() {
  const [step, setStep] = useState<Step>(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isBranchLocked, setIsBranchLocked] = useState(false);
  const [businessDate, setBusinessDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [fields, setFields] = useState<FinancialFields>({
    ...EMPTY_FINANCIAL_FIELDS,
  });
  const [manualActualCash, setManualActualCash] = useState("");
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

  const effectiveActualCash =
    useManualCash && manualActualCash !== ""
      ? parseFloat(manualActualCash) || 0
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
    setManualActualCash("");
    setUseManualCash(false);
    setZReportImage(null);
    setProofImages([]);
    setSaveError(null);
    setWarnings([]);
    setClosingId(null);
    setSaveSource(null);
  };

  const handleConfirmBranchChange = () => {
    if (
      window.confirm("تغيير الفرع؟ سيتم فقدان البيانات المدخلة.")
    ) {
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
    if (raw === "") {
      setFields((prev) => ({ ...prev, [key]: 0 }));
      return;
    }
    const num = parseFloat(raw);
    setFields((prev) => ({
      ...prev,
      [key]: Number.isFinite(num) ? num : prev[key],
    }));
  };

  const displayValue = (v: number) => (v === 0 ? "" : String(v));

  const onZReport = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setZReportImage(reader.result as string);
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

  const handleSave = useCallback(async () => {
    if (!selectedBranch) return;
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
      const result = await saveClosing({
        branchId: selectedBranch.id,
        businessDate,
        reviewedData: { ...fields },
        manualActualCash:
          useManualCash && manualActualCash !== ""
            ? parseFloat(manualActualCash)
            : undefined,
        zReportImageUrl: zReportImage ?? undefined,
        paymentProofImageUrls:
          proofImages.length > 0 ? proofImages : undefined,
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
    manualActualCash,
    zReportImage,
    proofImages,
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
            <NumberInput
              label="إجمالي المبيعات"
              value={displayValue(fields.grossSales)}
              onChange={(v) => setField("grossSales", v)}
            />
            <NumberInput
              label="صافي المبيعات"
              value={displayValue(fields.netSales)}
              onChange={(v) => setField("netSales", v)}
            />
            <NumberInput
              label="النقدية حسب النظام"
              value={displayValue(fields.cashSystem)}
              onChange={(v) => setField("cashSystem", v)}
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
                <input
                  type="number"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="النقدية الفعلية"
                  value={manualActualCash}
                  onChange={(e) => setManualActualCash(e.target.value)}
                />
              ) : (
                <div className="mt-2">
                  <NumberInput
                    label="النقدية المسلّمة"
                    value={displayValue(fields.cashActualHanded)}
                    onChange={(v) => setField("cashActualHanded", v)}
                  />
                </div>
              )}
            </div>
            <NumberInput
              label="سبان"
              value={displayValue(fields.spanSystem)}
              onChange={(v) => setField("spanSystem", v)}
            />
            <NumberInput
              label="تطبيقات التوصيل"
              value={displayValue(fields.deliveryAppsSystem)}
              onChange={(v) => setField("deliveryAppsSystem", v)}
            />
            <NumberInput
              label="حركات مرتجعة"
              value={displayValue(fields.reversedTransactions)}
              onChange={(v) => setField("reversedTransactions", v)}
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
                  تم الحفظ محليًا (وضع عدم الاتصال) — سيُرفع لاحقًا عند توفّر الاتصال.
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

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        type="number"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
