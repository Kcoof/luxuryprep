"use client";

// M7 — IT admin console (luxuryprep, bilingual AR/EN).
// Ticket queue over public.it_support_tickets (migration 006): list
// (latest 200), filter by status, update status + admin_note per ticket.
// No Firebase. Locale toggle mirrors the cashier screen; the auditor
// portal stays Arabic-only this round by decision.
//
// UX polish pass (queue PRESENTATION only — listTickets/updateTicket
// behavior and the session guard are UNCHANGED): login/cashier-grade
// header, filter chips with live counts, in-palette status badges with
// icons (slate open / amber in-progress / emerald resolved / slate-dim
// closed), min-h-11 touch targets + focus-visible rings, clearer
// loading/error/empty states, and card-frame restraint throughout. A
// dirty ticket card shows an amber border until its edits are saved.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  CircleDot,
  Clock,
  Info,
  LifeBuoy,
  Loader2,
  LogOut,
  RefreshCw,
  Server,
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

// ----------------------------------------------------------------------
// Shared class tokens — min-h-11 touch targets + restrained rings.
// ----------------------------------------------------------------------

const CONTROL_INPUT_CLASS =
  "w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const HEADER_ACTION_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:pointer-events-none disabled:opacity-50";

const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:pointer-events-none disabled:opacity-50";

// In-palette status tones: outline = awaiting triage, amber = active,
// emerald = resolved, dim slate = archived.
function statusBadgeClass(status: TicketStatus): string {
  switch (status) {
    case "open":
      return "bg-white text-slate-700 ring-slate-300";
    case "in_progress":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "resolved":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "closed":
      return "bg-slate-100 text-slate-500 ring-slate-200";
  }
}

function StatusIcon({ status }: { status: TicketStatus }) {
  const cls = "h-3 w-3 shrink-0";
  switch (status) {
    case "open":
      return <CircleDot className={cls} />;
    case "in_progress":
      return <Clock className={cls} />;
    case "resolved":
      return <CheckCircle2 className={cls} />;
    case "closed":
      return <Archive className={cls} />;
  }
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "urgent":
      return "bg-rose-100 text-rose-800 ring-rose-200";
    case "high":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "normal":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      return "bg-slate-100 text-slate-500 ring-slate-200";
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

function formatCount(n: number, locale: Locale): string {
  try {
    return n.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");
  } catch {
    return String(n);
  }
}

// ----------------------------------------------------------------------
// Single ticket card — status select + IT note + save (patch both fields).
// Remounts on update (key includes updatedAt) so saved props reset dirty.
// The card border turns amber while there are unsaved edits.
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
    <article
      className={`card-frame p-4 transition-colors ${
        dirty ? "border-amber-300" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            dir="ltr"
            className="text-start font-mono text-xs font-semibold text-slate-400"
          >
            {ticket.id}
          </p>
          <h3 className="mt-0.5 text-sm font-bold text-slate-900">
            {ticket.subject}
          </h3>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusBadgeClass(
            ticket.status,
          )}`}
        >
          <StatusIcon status={ticket.status} />
          {t(locale, statusLabelKey(ticket.status))}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-slate-500">
        {t(locale, "common.branch")}:{" "}
        <span className="font-medium text-slate-700">{ticket.branchId}</span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
          {t(locale, `ticket.category.${ticket.category}`)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${priorityBadgeClass(
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
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
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

  // Presentational only: live per-status counts for the filter chips so
  // triage workload is scannable at a glance.
  const ticketCounts = useMemo(() => {
    const counts: Record<TicketFilter, number> = {
      all: tickets.length,
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    };
    for (const tk of tickets) {
      counts[tk.status] += 1;
    }
    return counts;
  }, [tickets]);

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
      {/* Header — matches the cashier/login hierarchy: brand tile,
          title + wordmark line, locale toggle, logout. Touch ≥44px. */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 shadow-sm">
                <Server className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900">
                  {t(locale, "admin.title")}
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <span
                    dir="ltr"
                    className="font-semibold tracking-wide text-emerald-700"
                  >
                    luxuryprep
                  </span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  {t(locale, "admin.subtitle")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle locale={locale} onChange={handleLocaleChange} />
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
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {/* ---------------- Ticket queue ---------------- */}
        <section className="card-frame p-4 sm:p-5">
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
              className={SECONDARY_ACTION_CLASS}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${ticketsLoading ? "animate-spin" : ""}`}
              />
              {t(locale, "common.refresh")}
            </button>
          </div>

          {/* Status filter — chips carry live counts so the queue's shape
              is readable before scanning a single card. */}
          <div
            className="mt-3 flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t(locale, "admin.queue.title")}
          >
            {FILTER_OPTIONS.map((o) => {
              const active = filter === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(o.value)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 ${
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {t(locale, o.labelKey)}
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {formatCount(ticketCounts[o.value], locale)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            {ticketsLoading ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 py-8 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
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
                <div>
                  <button
                    type="button"
                    onClick={() => void refreshTickets()}
                    className={SECONDARY_ACTION_CLASS}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t(locale, "common.retry")}
                  </button>
                </div>
              </div>
            ) : visibleTickets.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <LifeBuoy className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">
                  {t(locale, "admin.queue.empty.title")}
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
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
          <div className="card-frame p-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="h-4 w-4 text-slate-400" />
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

          <div className="card-frame p-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Server className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-semibold">
                {t(locale, "admin.supabase.title")}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                {t(locale, "admin.supabase.envVars")}
              </span>
              {isSupabaseConfigured ? (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  {t(locale, "admin.supabase.configured")}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
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
