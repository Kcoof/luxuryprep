"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  History,
  ImageOff,
  Loader2,
  Lock,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import {
  AuditAction,
  ClosingStatus,
  DailyClosingAuditLog,
  FinancialFields,
  UserRole,
  computeShortageOrExcess,
} from "../types";
import {
  approveClosing,
  countPendingClosings,
  getClosing,
  listAuditLogs,
  listClosings,
  rejectClosing,
  resolveImageUrl,
  resolveImageUrls,
  type ClosingWithBranch,
} from "../lib/closings";

type TabId = "approvals" | "reports" | "audit";
type StatusFilter = "all" | ClosingStatus;

const STATUS_LABEL: Record<ClosingStatus, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
};

const ACTION_LABEL: Record<AuditAction, string> = {
  uploaded: "رفع الصور",
  ai_extracted: "استخراج آلي للبيانات",
  cashier_confirmed: "تأكيد الكاشير",
  approved: "اعتماد المراجع",
  rejected: "رفض المراجع",
  modified: "تعديل يدوي",
};

const ROLE_LABEL: Record<UserRole, string> = {
  cashier: "الكاشير",
  manager: "المدير",
  auditor: "المراجع المالي",
  ai: "الذكاء الاصطناعي",
};

const FIELD_LABEL: Record<keyof FinancialFields, string> = {
  grossSales: "إجمالي المبيعات",
  netSales: "صافي المبيعات",
  cashSystem: "النقدية حسب النظام",
  cashActualHanded: "النقدية المسلّمة فعليًا",
  spanSystem: "سبان",
  deliveryAppsSystem: "تطبيقات التوصيل",
  reversedTransactions: "المرتجعات / المستردة",
  shortageOrExcess: "العجز / الزيادة",
};

const FIELD_ORDER: (keyof FinancialFields)[] = [
  "grossSales",
  "netSales",
  "cashSystem",
  "cashActualHanded",
  "spanSystem",
  "deliveryAppsSystem",
  "reversedTransactions",
  "shortageOrExcess",
];

function formatSAR(n: number | undefined | null): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} ر.س`;
}

function formatShortageOrExcess(
  reviewed: Partial<FinancialFields> | undefined,
): number {
  if (reviewed?.shortageOrExcess !== undefined) {
    return reviewed.shortageOrExcess;
  }
  return computeShortageOrExcess(
    reviewed?.cashActualHanded ?? 0,
    reviewed?.cashSystem ?? 0,
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar-SA-u-ca-gregory", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: ClosingStatus }) {
  const styles: Record<ClosingStatus, string> = {
    pending: "bg-amber-100 text-amber-800 ring-amber-200",
    approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    rejected: "bg-rose-100 text-rose-800 ring-rose-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {status === "pending" && <Clock className="h-3 w-3" />}
      {status === "approved" && <CheckCircle2 className="h-3 w-3" />}
      {status === "rejected" && <XCircle className="h-3 w-3" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function ActionIcon({ action }: { action: AuditAction }) {
  const cls = "h-4 w-4";
  switch (action) {
    case "approved":
      return <CheckCircle2 className={`${cls} text-emerald-600`} />;
    case "rejected":
      return <XCircle className={`${cls} text-rose-600`} />;
    case "ai_extracted":
      return <Sparkles className={`${cls} text-indigo-600`} />;
    case "uploaded":
      return <FileText className={`${cls} text-slate-500`} />;
    case "modified":
      return <AlertTriangle className={`${cls} text-amber-600`} />;
    default:
      return <CheckCircle2 className={`${cls} text-slate-500`} />;
  }
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "rose" | "amber" | "emerald";
}) {
  const toneCls =
    tone === "rose"
      ? "text-rose-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "emerald"
          ? "text-emerald-700"
          : "text-slate-900";
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "rose" | "amber" | "neutral";
}) {
  const toneCls =
    tone === "rose"
      ? "text-rose-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-slate-900";
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${toneCls}`}>{value}</div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-slate-500">
      <Loader2 className="ml-2 h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export default function AuditorPage() {
  const [tab, setTab] = useState<TabId>("approvals");

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
            >
              <ArrowRight className="h-4 w-4" />
              العودة للرئيسية
            </Link>
            <div className="flex items-center gap-2 text-amber-700">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-sm font-medium">المراجعة المالية</span>
            </div>
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            بوابة المراجعة المالية والاعتماد
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            اعتماد الإقفالات اليومية، التقارير الموحّدة، وسجل التدقيق الرقمي.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div
          className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1"
          role="tablist"
        >
          <TabButton
            id="approvals"
            active={tab}
            onClick={setTab}
            icon={<FileText className="h-4 w-4" />}
            label="الاعتماد"
          />
          <TabButton
            id="reports"
            active={tab}
            onClick={setTab}
            icon={<ShieldCheck className="h-4 w-4" />}
            label="التقارير الموحّدة"
          />
          <TabButton
            id="audit"
            active={tab}
            onClick={setTab}
            icon={<History className="h-4 w-4" />}
            label="سجل التدقيق"
          />
        </div>

        {tab === "approvals" && <ApprovalsTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "audit" && <AuditLogTab />}
      </div>
    </main>
  );
}

function TabButton({
  id,
  active,
  onClick,
  icon,
  label,
}: {
  id: TabId;
  active: TabId;
  onClick: (id: TabId) => void;
  icon: ReactNode;
  label: string;
}) {
  const isActive = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onClick(id)}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
        isActive
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================================
// Tab 1 — Approvals
// ============================================================================

function ApprovalsTab() {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [list, setList] = useState<ClosingWithBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listClosings(filter);
      setList(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.branchName.toLowerCase().includes(q) ||
        c.businessDate.includes(q),
    );
  }, [list, search]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["all", "pending", "approved", "rejected"] as StatusFilter[]).map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filter === f
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {f === "all" ? "الكل" : STATUS_LABEL[f]}
            </button>
          ),
        )}
        <div className="relative mr-auto">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الإقفال أو الفرع أو التاريخ..."
            className="w-72 rounded-md border border-slate-200 bg-white py-1.5 pr-9 pl-3 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
      </div>

      {loading && <Spinner label="جارٍ تحميل الإقفالات..." />}
      {!loading && error && <ErrorBox message={error} />}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-500">
          لا توجد إقفالات مطابقة.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((c) => {
            const soe = formatShortageOrExcess(c.reviewedData);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="rounded-md border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-slate-500">
                      {c.id}
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-900">
                      {c.branchName}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {formatDate(c.businessDate)}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                  <Metric
                    label="النقدية المسلّمة"
                    value={formatSAR(c.reviewedData?.cashActualHanded)}
                  />
                  <Metric
                    label="النقدية حسب النظام"
                    value={formatSAR(c.reviewedData?.cashSystem)}
                  />
                  <Metric
                    label="العجز / الزيادة"
                    value={formatSAR(soe)}
                    tone={soe < 0 ? "rose" : soe > 0 ? "amber" : undefined}
                  />
                </div>
                {c.manuallyModifiedFields &&
                  c.manuallyModifiedFields.length > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                      <AlertTriangle className="h-3 w-3" />
                      توجد حقول معدّلة يدويًا ({c.manuallyModifiedFields.length})
                    </div>
                  )}
              </button>
            );
          })}
        </div>
      )}

      {selectedId && (
        <ClosingDetailModal
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onActionComplete={() => {
            setSelectedId(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ClosingDetailModal({
  id,
  onClose,
  onActionComplete,
}: {
  id: string;
  onClose: () => void;
  onActionComplete: () => void;
}) {
  const [closing, setClosing] = useState<ClosingWithBranch | null>(null);
  const [loading, setLoading] = useState(true);
  const [zUrl, setZUrl] = useState<string | null>(null);
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "approved" | "rejected">(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setClosing(null);
    setZUrl(null);
    setProofUrls([]);
    (async () => {
      try {
        const c = await getClosing(id);
        if (cancelled || !c) {
          if (!cancelled) {
            setLoading(false);
            if (!c) setLoadError("تعذّر العثور على الإقفال.");
          }
          return;
        }
        setClosing(c);
        const [z, ps] = await Promise.all([
          c.zReportImageUrl
            ? resolveImageUrl(c.zReportImageUrl)
            : Promise.resolve(null),
          c.paymentProofImageUrls && c.paymentProofImageUrls.length > 0
            ? resolveImageUrls(c.paymentProofImageUrls)
            : Promise.resolve<string[]>([]),
        ]);
        if (cancelled) return;
        setZUrl(z);
        setProofUrls(ps);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "تعذّر تحميل بيانات الإقفال.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  async function handleApprove() {
    if (!closing) return;
    if (closing.status !== "pending") return;
    setSubmitting(true);
    setFormError(null);
    try {
      await approveClosing(id, comment.trim() || undefined);
      setDone("approved");
      setTimeout(() => onActionComplete(), 800);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "حدث خطأ أثناء الاعتماد.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!closing) return;
    if (closing.status !== "pending") return;
    if (!comment.trim()) {
      setFormError("سبب الرفض مطلوب.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await rejectClosing(id, comment.trim());
      setDone("rejected");
      setTimeout(() => onActionComplete(), 800);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "حدث خطأ أثناء الرفض.");
    } finally {
      setSubmitting(false);
    }
  }

  const soe =
    closing?.reviewedData !== undefined
      ? formatShortageOrExcess(closing.reviewedData)
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="my-4 w-full max-w-4xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <div className="font-mono text-xs text-slate-500">{id}</div>
            <h2 className="text-base font-bold text-slate-900">
              تفاصيل الإقفال
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {loading && <Spinner label="جارٍ التحميل..." />}
          {!loading && loadError && <ErrorBox message={loadError} />}
          {!loading && !loadError && closing && (
            <div className="space-y-5">
              {/* Header info */}
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex-1">
                  <div className="text-xs text-slate-500">الفرع</div>
                  <div className="font-semibold text-slate-900">
                    {closing.branchName}
                    {closing.branchCity ? ` — ${closing.branchCity}` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">تاريخ العمل</div>
                  <div className="font-semibold text-slate-900">
                    {formatDate(closing.businessDate)}
                  </div>
                </div>
                <StatusBadge status={closing.status} />
              </div>

              {/* Z-report */}
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  تقرير Z
                </h3>
                {zUrl ? (
                  <a
                    href={zUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-md border border-slate-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={zUrl}
                      alt="تقرير Z"
                      className="max-h-96 w-full object-contain bg-slate-50"
                    />
                  </a>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                    <ImageOff className="h-4 w-4" />
                    لا توجد صورة لتقرير Z أو تعذّر تحميلها.
                  </div>
                )}
              </section>

              {/* Payment proofs */}
              {proofUrls.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">
                    صور إثبات الدفع ({proofUrls.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {proofUrls.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-md border border-slate-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`إثبات ${idx + 1}`}
                          className="h-32 w-full object-cover bg-slate-50"
                        />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Field comparison */}
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  المراجعة المالية
                </h3>
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-right font-medium">
                          الحقل
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          القيمة المستخرجة آليًا
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          القيمة المعتمدة من الكاشير
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {FIELD_ORDER.map((k) => {
                        const ai = closing.aiExtractedData?.[k];
                        const reviewed = closing.reviewedData?.[k];
                        if (ai === undefined && reviewed === undefined) {
                          return null;
                        }
                        const modified = new Set(
                          closing.manuallyModifiedFields ?? [],
                        ).has(k);
                        const isSoe = k === "shortageOrExcess";
                        const reviewedValue =
                          isSoe && reviewed === undefined ? soe : reviewed;
                        return (
                          <tr
                            key={k}
                            className={modified ? "bg-amber-50" : ""}
                          >
                            <td className="px-3 py-2 text-slate-700">
                              {FIELD_LABEL[k]}
                              {modified && (
                                <span className="mr-1 inline-flex items-center gap-0.5 rounded bg-amber-200 px-1 text-[10px] text-amber-900">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  معدّل
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-600">
                              {ai !== undefined ? formatSAR(ai) : "—"}
                            </td>
                            <td
                              className={`px-3 py-2 font-mono ${
                                modified
                                  ? "font-bold text-amber-900"
                                  : isSoe && typeof reviewedValue === "number"
                                    ? reviewedValue < 0
                                      ? "text-rose-700"
                                      : reviewedValue > 0
                                        ? "text-amber-700"
                                        : "text-slate-900"
                                    : "text-slate-900"
                              }`}
                            >
                              {reviewedValue !== undefined
                                ? formatSAR(reviewedValue)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* AI confidence */}
              {closing.aiConfidence &&
                Object.keys(closing.aiConfidence).length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-slate-700">
                      ثقة الاستخراج الآلي
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {FIELD_ORDER.map((k) => {
                        const c = closing.aiConfidence?.[k];
                        if (c === undefined) return null;
                        const pct = Math.round((c ?? 0) * 100);
                        const tone =
                          pct >= 85
                            ? "bg-emerald-100 text-emerald-800"
                            : pct >= 60
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800";
                        return (
                          <span
                            key={k}
                            className={`rounded px-2 py-0.5 text-xs ${tone}`}
                          >
                            {FIELD_LABEL[k]}: {pct}%
                          </span>
                        );
                      })}
                    </div>
                  </section>
                )}

              {/* Auditor action history */}
              {closing.status !== "pending" && (
                <section className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="font-semibold text-slate-700">
                    قرار المراجع
                  </div>
                  <div className="mt-1 text-slate-600">
                    {closing.status === "approved"
                      ? "تم الاعتماد"
                      : "تم الرفض"}
                    {closing.auditorReviewedAt &&
                      ` — ${formatDateTime(closing.auditorReviewedAt)}`}
                  </div>
                  {closing.auditorComment && (
                    <div className="mt-2 rounded bg-white px-3 py-2 text-slate-700">
                      «{closing.auditorComment}»
                    </div>
                  )}
                </section>
              )}

              {/* Action panel for pending */}
              {closing.status === "pending" && !done && (
                <section className="rounded-md border border-slate-200 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">
                    قرار المراجعة
                  </h3>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="ملاحظة المراجع (مطلوبة عند الرفض، اختيارية عند الاعتماد)"
                    rows={3}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                    disabled={submitting}
                  />
                  {formError && (
                    <div className="mt-2 text-sm text-rose-700">{formError}</div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={submitting}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      اعتماد
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={submitting}
                      className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      رفض
                    </button>
                  </div>
                </section>
              )}

              {done && (
                <section
                  className={`rounded-md border p-4 text-center ${
                    done === "approved"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {done === "approved" ? (
                    <CheckCircle2 className="mx-auto h-8 w-8" />
                  ) : (
                    <XCircle className="mx-auto h-8 w-8" />
                  )}
                  <div className="mt-2 font-semibold">
                    {done === "approved"
                      ? "تم اعتماد الإقفال بنجاح"
                      : "تم رفض الإقفال"}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab 2 — Unified reports (gated)
// ============================================================================

interface BranchAggregate {
  branchId: string;
  name: string;
  count: number;
  gross: number;
  cash: number;
  soe: number;
  reversals: number;
}

function ReportsTab() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [list, setList] = useState<ClosingWithBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pending = await countPendingClosings();
      setPendingCount(pending);
      if (pending === 0) {
        const data = await listClosings("approved");
        setList(data);
      } else {
        setList([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    return list.filter((c) => {
      if (fromDate && c.businessDate < fromDate) return false;
      if (toDate && c.businessDate > toDate) return false;
      return true;
    });
  }, [list, fromDate, toDate]);

  const kpis = useMemo(() => {
    const totals = {
      grossSales: 0,
      cashActualHanded: 0,
      shortageOrExcess: 0,
      reversedTransactions: 0,
    };
    for (const c of filtered) {
      totals.grossSales += c.reviewedData?.grossSales ?? 0;
      totals.cashActualHanded += c.reviewedData?.cashActualHanded ?? 0;
      totals.shortageOrExcess += formatShortageOrExcess(c.reviewedData);
      totals.reversedTransactions += c.reviewedData?.reversedTransactions ?? 0;
    }
    return totals;
  }, [filtered]);

  const byBranch = useMemo<BranchAggregate[]>(() => {
    const map = new Map<string, BranchAggregate>();
    for (const c of filtered) {
      const cur =
        map.get(c.branchId) ??
        ({
          branchId: c.branchId,
          name: c.branchName,
          count: 0,
          gross: 0,
          cash: 0,
          soe: 0,
          reversals: 0,
        } as BranchAggregate);
      cur.count += 1;
      cur.gross += c.reviewedData?.grossSales ?? 0;
      cur.cash += c.reviewedData?.cashActualHanded ?? 0;
      cur.soe += formatShortageOrExcess(c.reviewedData);
      cur.reversals += c.reviewedData?.reversedTransactions ?? 0;
      map.set(c.branchId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.gross - a.gross);
  }, [filtered]);

  function exportCsv() {
    const rows: string[][] = [
      [
        "الفرع",
        "تاريخ العمل",
        "إجمالي المبيعات",
        "النقدية المسلّمة",
        "النقدية حسب النظام",
        "العجز/الزيادة",
        "المرتجعات",
      ],
      ...filtered.map((c) => {
        const soe = formatShortageOrExcess(c.reviewedData);
        return [
          c.branchName,
          c.businessDate,
          String(c.reviewedData?.grossSales ?? 0),
          String(c.reviewedData?.cashActualHanded ?? 0),
          String(c.reviewedData?.cashSystem ?? 0),
          String(soe),
          String(c.reviewedData?.reversedTransactions ?? 0),
        ];
      }),
    ];
    const csv = rows
      .map((r) =>
        r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unified-report-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner label="جارٍ التحقق من حالة الإقفالات..." />;
  if (error) return <ErrorBox message={error} />;
  if (pendingCount !== null && pendingCount > 0) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-6 text-center">
        <Lock className="mx-auto h-9 w-9 text-amber-600" />
        <h3 className="mt-3 text-lg font-bold text-amber-900">
          التقارير الموحّدة مغلقة مؤقتًا
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-amber-800">
          يوجد حاليًا{" "}
          <span className="font-bold">
            {pendingCount.toLocaleString("ar-SA")}
          </span>{" "}
          إقفال قيد المراجعة. اعتمد أو ارفض جميع الإقفالات المعلّقة من تبويب
          «الاعتماد» لفتح التقارير الموحّدة وضمان دقّتها.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3">
        <div>
          <label className="block text-xs text-slate-500">من تاريخ</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">إلى تاريخ</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => {
              setFromDate("");
              setToDate("");
            }}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            إعادة ضبط
          </button>
        )}
        <div className="mr-auto flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            تصدير CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            طباعة
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="إجمالي المبيعات"
          value={formatSAR(kpis.grossSales)}
        />
        <KpiCard
          label="النقدية المسلّمة"
          value={formatSAR(kpis.cashActualHanded)}
        />
        <KpiCard
          label="صافي العجز / الزيادة"
          value={formatSAR(kpis.shortageOrExcess)}
          tone={
            kpis.shortageOrExcess < 0
              ? "rose"
              : kpis.shortageOrExcess > 0
                ? "amber"
                : "neutral"
          }
        />
        <KpiCard
          label="المرتجعات / المستردة"
          value={formatSAR(kpis.reversedTransactions)}
        />
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
          ملخّص حسب الفرع ({filtered.length} إقفال)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 text-right font-medium">الفرع</th>
                <th className="px-4 py-2 text-right font-medium">
                  عدد الإقفالات
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  إجمالي المبيعات
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  النقدية المسلّمة
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  العجز / الزيادة
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  المرتجعات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byBranch.map((b) => (
                <tr key={b.branchId}>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {b.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {b.count.toLocaleString("ar-SA")}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-900">
                    {formatSAR(b.gross)}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-700">
                    {formatSAR(b.cash)}
                  </td>
                  <td
                    className={`px-4 py-2 font-mono ${
                      b.soe < 0
                        ? "text-rose-700"
                        : b.soe > 0
                          ? "text-amber-700"
                          : "text-slate-700"
                    }`}
                  >
                    {formatSAR(b.soe)}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-700">
                    {formatSAR(b.reversals)}
                  </td>
                </tr>
              ))}
              {byBranch.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    لا توجد بيانات معتمدة في النطاق المحدّد.
                  </td>
                </tr>
              )}
            </tbody>
            {byBranch.length > 0 && (
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <td className="px-4 py-2 text-slate-900">الإجمالي</td>
                  <td className="px-4 py-2 text-slate-700">
                    {filtered.length.toLocaleString("ar-SA")}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-900">
                    {formatSAR(kpis.grossSales)}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-900">
                    {formatSAR(kpis.cashActualHanded)}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-900">
                    {formatSAR(kpis.shortageOrExcess)}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-900">
                    {formatSAR(kpis.reversedTransactions)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab 3 — Audit log
// ============================================================================

function AuditLogTab() {
  const [logs, setLogs] = useState<DailyClosingAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingIdFilter, setClosingIdFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAuditLogs({
        closingId: closingIdFilter.trim() || undefined,
        action: actionFilter === "all" ? undefined : actionFilter,
      });
      setLogs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع.");
    } finally {
      setLoading(false);
    }
  }, [closingIdFilter, actionFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={closingIdFilter}
            onChange={(e) => setClosingIdFilter(e.target.value)}
            placeholder="رقم الإقفال..."
            className="w-64 rounded-md border border-slate-200 py-1.5 pr-9 pl-3 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) =>
            setActionFilter(e.target.value as "all" | AuditAction)
          }
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        >
          <option value="all">كل الإجراءات</option>
          {(Object.entries(ACTION_LABEL) as [AuditAction, string][]).map(
            ([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ),
          )}
        </select>
        {(closingIdFilter || actionFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setClosingIdFilter("");
              setActionFilter("all");
            }}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            إعادة ضبط
          </button>
        )}
      </div>

      {loading && <Spinner label="جارٍ تحميل سجل التدقيق..." />}
      {!loading && error && <ErrorBox message={error} />}
      {!loading && !error && logs.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-500">
          لا توجد سجلات مطابقة.
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <ol className="relative space-y-2 border-r-2 border-slate-200 pr-4">
          {logs.map((log) => (
            <li
              key={log.id}
              className="relative rounded-md border border-slate-200 bg-white p-3 shadow-sm"
            >
              <span className="absolute -right-[1.40rem] top-4 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-slate-300" />
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ActionIcon action={log.action} />
                  <span className="font-medium text-slate-900">
                    {ACTION_LABEL[log.action]}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {formatDateTime(log.timestamp)}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-mono">{log.closingId}</span>
                <span className="mx-1 text-slate-300">·</span>
                <span>{ROLE_LABEL[log.actorRole]}</span>
                {log.actorId && (
                  <>
                    <span className="mx-1 text-slate-300">·</span>
                    <span className="text-slate-400">{log.actorId}</span>
                  </>
                )}
              </div>
              {log.comment && (
                <div className="mt-2 rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {log.comment}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}