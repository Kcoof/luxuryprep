"use client";

// M7 — IT admin console (luxuryprep, bilingual AR/EN).
// Ticket queue over public.it_support_tickets (migration 006): list
// (latest 200), filter by status, update status + admin_note per ticket.
// No Firebase. Locale toggle mirrors the cashier screen; the auditor
// portal stays Arabic-only this round by decision.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Clock,
  Info,
  LifeBuoy,
  Loader2,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { clearSession, requireRole, type Session } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import LocaleToggle from "../components/locale-toggle";
import {
  DEFAULT_LOCALE,
  dirFor,
  getLocale,
  setLocale as persistLocale,
  t,
  type Locale,
} from "../lib/i18n";
import {
  listTickets,
  updateTicket,
  TICKETS_NOT_CONFIGURED,
} from "../lib/tickets";
import type { ItSupportTicket, TicketStatus } from "../types";

type TicketFilter = "all" | TicketStatus;

const FILTER_OPTIONS: { value: TicketFilter; labelKey: string }[] = [
  { value: "all", labelKey: "admin.filter.all" },
  { value: "open", labelKey: "admin.filter.open" },
  { value: "in_progress", labelKey: "admin.filter.inProgress" },
  { value: "resolved", labelKey: "admin.filter.resolved" },
  { value: "closed", labelKey: "admin.filter.closed" },
];

const STATUS_OPTIONS: { value: TicketStatus; labelKey: string }[] = [
  { value: "open", labelKey: "admin.status.open" },
  { value: "in_progress", labelKey: "admin.status.inProgress" },
  { value: "resolved", labelKey: "admin.status.resolved" },
  { value: "closed", labelKey: "admin.status.closed" },
];

// F1 (R3): resolve display labels through the STATUS_OPTIONS map instead
// of interpolating the DB snake_case enum ("in_progress") into a key —
// the camelCase dictionary key would silently miss and render raw.
function statusLabelKey(status: TicketStatus): string {
  return (
    STATUS_OPTIONS.find((o) => o.value === status)?.labelKey ??
    `admin.status.${status}`
  );
}

const CONTROL_INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

function statusBadgeClass(status: TicketStatus): string {
  switch (status) {
    case "open":
      return "bg-sky-100 text-sky-800";
    case "in_progress":
      return "bg-amber-100 text-amber-800";
    case "resolved":
      return "bg-emerald-100 text-emerald-800";
    case "closed":
      return "bg-slate-200 text-slate-700";
  }
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "urgent":
      return "bg-rose-100 text-rose-800";
    case "high":
      return "bg-amber-100 text-amber-800";
    case "normal":
      return "bg-sky-100 text-sky-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function formatTimestamp(iso: string, locale: Locale): string {
  try {
    return new Date(iso).toLocaleString(
      locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  } catch {
    return iso;
  }
}

// ----------------------------------------------------------------------
// Single ticket card — status select + IT note + save (patch both fields).
// Remounts on update (key includes updatedAt) so saved props reset dirty.
// ----------------------------------------------------------------------

function TicketCard({
  locale,
  ticket,
  onUpdated,
}: {
  locale: Locale;
  ticket: ItSupportTicket;
  onUpdated: (ticket: ItSupportTicket) => void;
}) {
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [note, setNote] = useState(ticket.adminNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = status !== ticket.status || note !== (ticket.adminNote ?? "");

  async function handleSave() {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTicket({
        id: ticket.id,
        status,
        adminNote: note,
      });
      onUpdated(updated);
    } catch {
      setError(t(locale, "admin.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card-frame p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-slate-400">
            {ticket.id}
          </p>
          <h3 className="mt-0.5 text-sm font-bold text-slate-900">
            {ticket.subject}
          </h3>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(
            ticket.status,
          )}`}
        >
          {t(locale, statusLabelKey(ticket.status))}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-slate-500">
        {t(locale, "common.branch")}:{" "}
        <span className="font-medium text-slate-700">{ticket.branchId}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
          {t(locale, `ticket.category.${ticket.category}`)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${priorityBadgeClass(
            ticket.priority,
          )}`}
        >
          {t(locale, `ticket.priority.${ticket.priority}`)}
        </span>
        <span className="text-slate-400">
          {t(locale, "admin.createdBy")}:{" "}
          {ticket.createdByLabel ?? ticket.createdByRole} ·{" "}
          {formatTimestamp(ticket.createdAt, locale)}
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
        <p className="text-[11px] font-semibold text-slate-500">
          {t(locale, "admin.description")}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
          {ticket.description}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <label
            htmlFor={`ticket-status-${ticket.id}`}
            className="mb-1 block text-[11px] font-medium text-slate-500"
          >
            {t(locale, "admin.status")}
          </label>
          <select
            id={`ticket-status-${ticket.id}`}
            value={status}
            onChange={(e) => setStatus(e.target.value as TicketStatus)}
            className={CONTROL_INPUT_CLASS}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(locale, o.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`ticket-note-${ticket.id}`}
            className="mb-1 block text-[11px] font-medium text-slate-500"
          >
            {t(locale, "admin.adminNote")}
          </label>
          <textarea
            id={`ticket-note-${ticket.id}`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(locale, "admin.adminNotePlaceholder")}
            className={`${CONTROL_INPUT_CLASS} resize-y`}
          />
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t(locale, "common.saving")}
              </>
            ) : (
              t(locale, "common.save")
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

// ----------------------------------------------------------------------
// Admin page
// ----------------------------------------------------------------------

export default function AdminPage() {
  const router = useRouter();

  // M7: bilingual locale state (mirrors the cashier screen).
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
      // F2 (R3): restore the pre-mount document lang/dir so an EN admin
      // session cannot leak LTR into the Arabic-only auditor portal.
      root.lang = prevLang;
      root.dir = prevDir;
    };
  }, [locale, dir]);

  const handleLocaleChange = useCallback((next: Locale) => {
    persistLocale(next);
    setLocale(next);
  }, []);

  // M6: gateway guard — admin session required.
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const s = requireRole("admin");
    if (!s) {
      router.replace("/");
      return;
    }
    setSession(s);
    setAuthChecked(true);
  }, [router]);

  const handleLogout = useCallback(() => {
    clearSession();
    router.replace("/");
  }, [router]);

  // M7: ticket queue state.
  const [tickets, setTickets] = useState<ItSupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState<
    "notConfigured" | "request" | null
  >(null);
  const [filter, setFilter] = useState<TicketFilter>("all");

  const refreshTickets = useCallback(async () => {
    setTicketsLoading(true);
    setTicketsError(null);
    try {
      const list = await listTickets();
      setTickets(list);
    } catch (err) {
      setTicketsError(
        err instanceof Error && err.message === TICKETS_NOT_CONFIGURED
          ? "notConfigured"
          : "request",
      );
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) {
      void refreshTickets();
    }
  }, [authChecked, refreshTickets]);

  function handleTicketUpdated(updated: ItSupportTicket) {
    setTickets((prev) =>
      prev.map((tk) => (tk.id === updated.id ? updated : tk)),
    );
  }

  const visibleTickets =
    filter === "all"
      ? tickets
      : tickets.filter((tk) => tk.status === filter);

  if (!authChecked) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-slate-50"
        dir={dir}
      >
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t(locale, "common.checkingSession")}</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50" dir={dir}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-sm font-semibold tracking-wide">
                luxuryprep
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle locale={locale} onChange={handleLocaleChange} />
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1 text-sm text-slate-600 transition hover:text-rose-600"
              >
                <LogOut className="h-4 w-4" />
                {t(locale, "common.logout")}
              </button>
            </div>
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            {t(locale, "admin.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t(locale, "admin.subtitle")}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {/* ---------------- Ticket queue ---------------- */}
        <section className="card-frame p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                {t(locale, "admin.queue.title")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void refreshTickets()}
              disabled={ticketsLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${ticketsLoading ? "animate-spin" : ""}`}
              />
              {t(locale, "common.refresh")}
            </button>
          </div>

          {/* Status filter */}
          <div className="mt-3 flex flex-wrap gap-1.5" role="group">
            {FILTER_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={filter === o.value}
                onClick={() => setFilter(o.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filter === o.value
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t(locale, o.labelKey)}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {ticketsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t(locale, "admin.queue.loading")}
              </div>
            ) : ticketsError === "notConfigured" ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t(locale, "admin.queue.notConfigured")}</span>
              </div>
            ) : ticketsError === "request" ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t(locale, "admin.queue.error")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshTickets()}
                  className="text-sm font-medium text-emerald-700 hover:underline"
                >
                  {t(locale, "common.retry")}
                </button>
              </div>
            ) : visibleTickets.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <LifeBuoy className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">
                  {t(locale, "admin.queue.empty.title")}
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                  {t(locale, "admin.queue.empty.body")}
                </p>
              </div>
            ) : (
              visibleTickets.map((tk) => (
                <TicketCard
                  key={`${tk.id}_${tk.updatedAt}`}
                  locale={locale}
                  ticket={tk}
                  onUpdated={handleTicketUpdated}
                />
              ))
            )}
          </div>
        </section>

        {/* ---------------- Session + Supabase status ---------------- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-semibold">
                {t(locale, "admin.session.title")}
              </span>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">
                  {t(locale, "admin.session.role")}
                </dt>
                <dd className="font-medium text-slate-900">
                  {t(locale, "login.role.admin")}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">
                  {t(locale, "admin.session.loginAt")}
                </dt>
                <dd className="font-medium text-slate-900">
                  {session ? formatTimestamp(session.at, locale) : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Server className="h-4 w-4" />
              <span className="text-sm font-semibold">
                {t(locale, "admin.supabase.title")}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                {t(locale, "admin.supabase.envVars")}
              </span>
              {isSupabaseConfigured ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  {t(locale, "admin.supabase.configured")}
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  {t(locale, "admin.supabase.notConfigured")}
                </span>
              )}
            </div>
            <p className="mt-2 flex items-start gap-1 text-xs text-slate-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {t(locale, "admin.supabase.note")}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

