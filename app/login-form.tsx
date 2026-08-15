"use client";

// M6 — luxuryprep login gateway (demo v1).
// Tabs: الفرع/الكاشير · المراجعة المالية · مسؤول IT.
// No Firebase. Branches are validated against the Supabase branch list.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calculator,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Store,
  UserCog,
} from "lucide-react";
import type { Branch } from "./types";
import { loadBranches } from "./lib/branches";
import {
  checkAdminCredentials,
  checkFinanceCredentials,
  clearSession,
  getSession,
  sessionHomeFor,
  setSession,
  startCashierSession,
  type Session,
  type SessionRole,
} from "./lib/auth";

type LoginTab = "cashier" | "finance" | "it";

const TABS: { id: LoginTab; label: string; icon: typeof Store }[] = [
  { id: "cashier", label: "الفرع / الكاشير", icon: Store },
  { id: "finance", label: "المراجعة المالية", icon: ShieldCheck },
  { id: "it", label: "مسؤول IT", icon: UserCog },
];

const ROLE_LABEL: Record<SessionRole, string> = {
  cashier: "كاشير الفرع",
  manager: "مدير الفرع",
  auditor: "المراجعة المالية",
  admin: "مسؤول IT",
};

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const SUBMIT_CLASS =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50";

export default function LoginForm() {
  const router = useRouter();
  const [tab, setTab] = useState<LoginTab>("cashier");

  // Branch list — loaded from Supabase (public.branches) so every branch
  // shown (or typed) is validated against the real list.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [manualBranchId, setManualBranchId] = useState("");

  // Credential forms (demo v1).
  const [financeUser, setFinanceUser] = useState("");
  const [financePassword, setFinancePassword] = useState("");
  const [adminUser, setAdminUser] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showFinancePassword, setShowFinancePassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  const reloadBranches = useCallback(() => {
    let cancelled = false;
    setBranchesLoading(true);
    setBranchesError(null);
    loadBranches()
      .then((list) => {
        if (cancelled) return;
        setBranches(list);
      })
      .catch(() => {
        if (cancelled) return;
        setBranchesError("تعذّر تحميل قائمة الفروع من Supabase.");
      })
      .finally(() => {
        if (cancelled) return;
        setBranchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // localStorage is client-only — read any existing session after mount.
    setActiveSession(getSession());
    const cancel = reloadBranches();
    return cancel;
  }, [reloadBranches]);

  function switchTab(id: LoginTab) {
    setTab(id);
    setFormError(null);
  }

  function handleBranchIdChange(raw: string) {
    setManualBranchId(raw);
    if (formError) setFormError(null);
    // Typing an id (B01…) is allowed — it must match a loaded branch.
    const typed = raw.trim().toUpperCase();
    if (typed && branches.some((b) => b.id === typed)) {
      setSelectedBranchId(typed);
    }
  }

  function handleCashierSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const typed = manualBranchId.trim().toUpperCase();
    const branch =
      branches.find((b) => b.id === typed) ??
      branches.find((b) => b.id === selectedBranchId) ??
      null;
    if (!branch) {
      setFormError("اختر فرعًا من القائمة أو أدخل رقمه الصحيح (مثل B01).");
      return;
    }
    setSubmitting(true);
    try {
      // Writes both luxuryprep_session and cashier_selected_branch.
      startCashierSession({ id: branch.id, name: branch.name });
      router.replace("/cashier");
    } finally {
      setSubmitting(false);
    }
  }

  function handleFinanceSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    if (!financeUser.trim() || !financePassword) {
      setFormError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }
    setSubmitting(true);
    try {
      if (!checkFinanceCredentials(financeUser, financePassword)) {
        setFormError("بيانات الدخول غير صحيحة.");
        return;
      }
      setSession({ role: "auditor", at: new Date().toISOString() });
      router.replace("/auditor");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAdminSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    if (!adminUser.trim() || !adminPassword) {
      setFormError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }
    setSubmitting(true);
    try {
      if (!checkAdminCredentials(adminUser, adminPassword)) {
        setFormError("بيانات الدخول غير صحيحة.");
        return;
      }
      setSession({ role: "admin", at: new Date().toISOString() });
      router.replace("/admin");
    } finally {
      setSubmitting(false);
    }
  }

  function handleContinueSession() {
    if (!activeSession) return;
    router.replace(sessionHomeFor(activeSession.role));
  }

  function handleLogoutSession() {
    clearSession();
    setActiveSession(null);
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 via-white to-emerald-50 px-4 py-10"
      dir="rtl"
    >
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          {/* Brand */}
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
              <Calculator className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-900">
              بوابة الإغلاق المالي والمراجعة
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              <span className="font-semibold tracking-wide text-emerald-700">
                luxuryprep
              </span>{" "}
              — تسجيل الدخول
            </p>
          </div>

          {/* Tabs */}
          <div
            className="mb-6 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
            role="tablist"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchTab(t.id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition sm:flex-row sm:gap-2 sm:text-sm ${
                    isActive
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Existing session */}
          {activeSession && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm text-emerald-800">
                  جلسة نشطة:{" "}
                  <span className="font-semibold">
                    {ROLE_LABEL[activeSession.role]}
                  </span>
                  {activeSession.branchName
                    ? ` — ${activeSession.branchName}`
                    : ""}
                </p>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleContinueSession}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  متابعة
                </button>
                <button
                  type="button"
                  onClick={handleLogoutSession}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  تسجيل الخروج
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {formError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Tab: cashier / branch */}
          {tab === "cashier" && (
            <form onSubmit={handleCashierSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-branch"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  الفرع
                </label>
                {branchesLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ تحميل الفروع…
                  </div>
                ) : branchesError ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{branchesError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={reloadBranches}
                      className="text-sm font-medium text-emerald-700 hover:underline"
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                ) : (
                  <select
                    id="login-branch"
                    value={selectedBranchId}
                    onChange={(e) => {
                      setSelectedBranchId(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    className={INPUT_CLASS}
                  >
                    <option value="">— اختر الفرع —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {!branchesLoading && !branchesError && (
                <div>
                  <label
                    htmlFor="login-branch-id"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    أو أدخل رقم الفرع
                  </label>
                  <input
                    id="login-branch-id"
                    type="text"
                    dir="ltr"
                    placeholder="B01"
                    value={manualBranchId}
                    onChange={(e) => handleBranchIdChange(e.target.value)}
                    className={`${INPUT_CLASS} font-mono uppercase`}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    يجب أن يطابق فرعًا من القائمة (B01…) — يُتحقق من الرقم
                    مقابل قائمة الفروع.
                  </p>
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || branchesLoading || branchesError !== null}
                className={SUBMIT_CLASS}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ الدخول…
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    دخول الكاشير
                  </>
                )}
              </button>
            </form>
          )}

          {/* Tab: finance / auditor */}
          {tab === "finance" && (
            <form onSubmit={handleFinanceSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="finance-user"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  اسم المستخدم
                </label>
                <input
                  id="finance-user"
                  type="text"
                  dir="ltr"
                  autoComplete="username"
                  value={financeUser}
                  onChange={(e) => {
                    setFinanceUser(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label
                  htmlFor="finance-password"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    id="finance-password"
                    type={showFinancePassword ? "text" : "password"}
                    dir="ltr"
                    autoComplete="current-password"
                    value={financePassword}
                    onChange={(e) => {
                      setFinancePassword(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    className={`${INPUT_CLASS} pl-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowFinancePassword((v) => !v)}
                    aria-label={
                      showFinancePassword
                        ? "إخفاء كلمة المرور"
                        : "إظهار كلمة المرور"
                    }
                    className="absolute inset-y-0 left-2 flex items-center text-slate-400 transition hover:text-slate-600"
                  >
                    {showFinancePassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={submitting} className={SUBMIT_CLASS}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ الدخول…
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    دخول المراجعة المالية
                  </>
                )}
              </button>
            </form>
          )}

          {/* Tab: IT / admin */}
          {tab === "it" && (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-user"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  اسم المستخدم
                </label>
                <input
                  id="admin-user"
                  type="text"
                  dir="ltr"
                  autoComplete="username"
                  value={adminUser}
                  onChange={(e) => {
                    setAdminUser(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label
                  htmlFor="admin-password"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showAdminPassword ? "text" : "password"}
                    dir="ltr"
                    autoComplete="current-password"
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    className={`${INPUT_CLASS} pl-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((v) => !v)}
                    aria-label={
                      showAdminPassword
                        ? "إخفاء كلمة المرور"
                        : "إظهار كلمة المرور"
                    }
                    className="absolute inset-y-0 left-2 flex items-center text-slate-400 transition hover:text-slate-600"
                  >
                    {showAdminPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={submitting} className={SUBMIT_CLASS}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ الدخول…
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    دخول مسؤول IT
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          وضع تجريبي — المراجعة المالية: finance / finance · مسؤول IT: admin /
          admin
        </p>
      </div>
    </main>
  );
}