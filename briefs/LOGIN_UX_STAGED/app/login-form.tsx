"use client";

// M6 — luxuryprep login gateway (demo v1). M7 — bilingual AR/EN.
// UX polish pass — brand-first gateway: the luxuryprep wordmark is the
// hero signal and the long product line stays secondary. One centered
// card, quiet slate→emerald atmosphere, 44px touch targets, and three
// intentional transitions (tab-panel fade, button press/focus, tab
// state). Auth logic, session handling and routes are unchanged.
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
import LocaleToggle from "./components/locale-toggle";
import {
  DEFAULT_LOCALE,
  dirFor,
  getLocale,
  setLocale as persistLocale,
  t,
  type Locale,
} from "./lib/i18n";

type LoginTab = "cashier" | "finance" | "it";

const TABS: { id: LoginTab; labelKey: string; icon: typeof Store }[] = [
  { id: "cashier", labelKey: "login.tab.cashier", icon: Store },
  { id: "finance", labelKey: "login.tab.finance", icon: ShieldCheck },
  { id: "it", labelKey: "login.tab.it", icon: UserCog },
];

const ROLE_LABEL_KEY: Record<SessionRole, string> = {
  cashier: "login.role.cashier",
  manager: "login.role.manager",
  auditor: "login.role.auditor",
  admin: "login.role.admin",
};

const INPUT_CLASS =
  "w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const SUBMIT_CLASS =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const TAB_BUTTON_CLASS =
  "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-all duration-150 sm:flex-row sm:gap-2 sm:text-sm";
const TAB_ACTIVE_CLASS = "bg-white text-emerald-700 shadow-sm ring-1 ring-slate-900/5";
const TAB_IDLE_CLASS = "text-slate-500 hover:text-slate-800";

export default function LoginForm() {
  const router = useRouter();
  const [tab, setTab] = useState<LoginTab>("cashier");

  // ------------------------------------------------------------------
  // M7: bilingual locale state. Default Arabic (RTL); EN switches to LTR.
  // Preference persists in localStorage (`luxuryprep_locale`).
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
      // F2 (R3): restore the pre-mount document lang/dir on unmount so a
      // locale chosen here cannot leak into the next screen (notably the
      // Arabic-only auditor portal).
      root.lang = prevLang;
      root.dir = prevDir;
    };
  }, [locale, dir]);

  const handleLocaleChange = useCallback((next: Locale) => {
    persistLocale(next);
    setLocale(next);
  }, []);

  // Branch list — loaded from Supabase (public.branches) so every branch
  // shown (or typed) is validated against the real list.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesFailed, setBranchesFailed] = useState(false);
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
    setBranchesFailed(false);
    loadBranches()
      .then((list) => {
        if (cancelled) return;
        setBranches(list);
      })
      .catch(() => {
        if (cancelled) return;
        setBranchesFailed(true);
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
      setFormError(t(locale, "login.error.pickBranch"));
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
      setFormError(t(locale, "login.error.enterCredentials"));
      return;
    }
    setSubmitting(true);
    try {
      if (!checkFinanceCredentials(financeUser, financePassword)) {
        setFormError(t(locale, "login.error.invalid"));
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
      setFormError(t(locale, "login.error.enterCredentials"));
      return;
    }
    setSubmitting(true);
    try {
      if (!checkAdminCredentials(adminUser, adminPassword)) {
        setFormError(t(locale, "login.error.invalid"));
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
      dir={dir}
    >
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
          {/* Locale toggle */}
          <div className="mb-3 flex justify-end">
            <LocaleToggle locale={locale} onChange={handleLocaleChange} />
          </div>

          {/* Brand — luxuryprep is the hero signal; the long product line
              stays secondary beneath the wordmark. */}
          <div className="mb-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-emerald-400 shadow-sm">
              <Calculator className="h-6 w-6" />
            </div>
            <h1
              dir="ltr"
              className="mt-4 text-2xl font-bold tracking-tight text-slate-900"
            >
              luxury<span className="text-emerald-600">prep</span>
            </h1>
            <p className="mt-1.5 text-xs font-medium leading-5 text-slate-500">
              {t(locale, "login.title")}
            </p>
          </div>

          {/* One job: sign in to the right portal. */}
          <p className="mb-2.5 text-center text-xs text-slate-500">
            {t(locale, "login.portalHint")}
          </p>

          {/* Tabs — segmented control, 44px touch targets on mobile. */}
          <div
            className="mb-6 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
            role="tablist"
          >
            {TABS.map((tabDef) => {
              const Icon = tabDef.icon;
              const isActive = tab === tabDef.id;
              return (
                <button
                  key={tabDef.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchTab(tabDef.id)}
                  className={`${TAB_BUTTON_CLASS} ${
                    isActive ? TAB_ACTIVE_CLASS : TAB_IDLE_CLASS
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(locale, tabDef.labelKey)}</span>
                </button>
              );
            })}
          </div>

          {/* Existing session */}
          {activeSession && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm leading-5 text-emerald-900">
                  {t(locale, "login.sessionActive")}{" "}
                  <span className="font-semibold">
                    {t(locale, ROLE_LABEL_KEY[activeSession.role])}
                  </span>
                  {activeSession.branchName
                    ? ` — ${activeSession.branchName}`
                    : ""}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleContinueSession}
                  className="inline-flex min-h-11 items-center rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                >
                  {t(locale, "login.continue")}
                </button>
                <button
                  type="button"
                  onClick={handleLogoutSession}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t(locale, "common.logout")}
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

          {/* Panels — the keyed wrapper drives the single tab-panel fade
              (see .login-panel-in in globals.css). Form state lives in
              this component, so remounting the wrapper is safe. */}
          <div key={tab} className="login-panel-in">
            {/* Tab: cashier / branch */}
            {tab === "cashier" && (
              <form onSubmit={handleCashierSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="login-branch"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    {t(locale, "common.branch")}
                  </label>
                  {branchesLoading ? (
                    <div className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t(locale, "common.branchesLoading")}
                    </div>
                  ) : branchesFailed ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t(locale, "common.branchesError")}</span>
                      </div>
                      <button
                        type="button"
                        onClick={reloadBranches}
                        className="inline-flex min-h-9 items-center text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-800 hover:underline"
                      >
                        {t(locale, "common.retry")}
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
                      <option value="">{t(locale, "common.branchPlaceholder")}</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.id} — {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {!branchesLoading && !branchesFailed && (
                  <div>
                    <label
                      htmlFor="login-branch-id"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      {t(locale, "login.branchIdLabel")}
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
                      {t(locale, "login.branchIdHint")}
                    </p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting || branchesLoading || branchesFailed}
                  className={SUBMIT_CLASS}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t(locale, "login.signingIn")}
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      {t(locale, "login.submit.cashier")}
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
                    {t(locale, "login.username")}
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
                    {t(locale, "login.password")}
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
                      className={`${INPUT_CLASS} pe-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowFinancePassword((v) => !v)}
                      aria-label={t(
                        locale,
                        showFinancePassword
                          ? "login.hidePassword"
                          : "login.showPassword",
                      )}
                      className="absolute inset-y-0 end-1 flex w-10 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
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
                      {t(locale, "login.signingIn")}
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      {t(locale, "login.submit.finance")}
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
                    {t(locale, "login.username")}
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
                    {t(locale, "login.password")}
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
                      className={`${INPUT_CLASS} pe-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword((v) => !v)}
                      aria-label={t(
                        locale,
                        showAdminPassword
                          ? "login.hidePassword"
                          : "login.showPassword",
                      )}
                      className="absolute inset-y-0 end-1 flex w-10 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40"
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
                      {t(locale, "login.signingIn")}
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      {t(locale, "login.submit.it")}
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          {t(locale, "login.demoFooter")}
        </p>
      </div>
    </main>
  );
}

