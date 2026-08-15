"use client";

// M7 — cashier branch dashboard sections (bilingual AR/EN):
//   PreCloseChecklist — 6 closing-ops items, UI-only, persisted per
//     branch+date in localStorage
//     (`luxuryprep_preclose_checklist_<branchId>_<businessDate>`).
//   ItStatusWidget — static demo badges (Foodics / Mada / printer).
//   ItTicketModal — inserts into public.it_support_tickets via lib/tickets.
// Presentational only; no closing-wizard logic lives in this file.

import { useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  AlertCircle,
  Check,
  ClipboardCheck,
  CreditCard,
  LifeBuoy,
  Loader2,
  Monitor,
  Printer,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";
import { t, type Locale } from "../lib/i18n";
import { createTicket, TICKETS_NOT_CONFIGURED } from "../lib/tickets";
import type {
  ItSupportTicket,
  TicketCategory,
  TicketPriority,
} from "../types";

// ----------------------------------------------------------------------
// Pre-close checklist (UI-only, localStorage per branch + business date)
// ----------------------------------------------------------------------

const CHECKLIST_ITEM_KEYS = [
  "cashier.checklist.item.cashCounted",
  "cashier.checklist.item.zReport",
  "cashier.checklist.item.mada",
  "cashier.checklist.item.tips",
  "cashier.checklist.item.safeDrop",
  "cashier.checklist.item.manager",
] as const;

function checklistStorageKey(branchId: string, businessDate: string): string {
  return `luxuryprep_preclose_checklist_${branchId}_${businessDate}`;
}

export function PreCloseChecklist({
  locale,
  branchId,
  businessDate,
}: {
  locale: Locale;
  branchId: string;
  businessDate: string;
}) {
  const storageKey = checklistStorageKey(branchId, businessDate);
  const [checked, setChecked] = useState<boolean[]>(() =>
    CHECKLIST_ITEM_KEYS.map(() => false),
  );
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // Load on mount and whenever branch/date (i.e. the storage key) changes.
  useEffect(() => {
    const restored = CHECKLIST_ITEM_KEYS.map(() => false);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (let i = 0; i < restored.length; i += 1) {
            restored[i] = parsed[i] === true;
          }
        }
      }
    } catch {
      // corrupted entry — start clean
    }
    setChecked(restored);
    setLoadedKey(storageKey);
  }, [storageKey]);

  // Persist, but only after the state for the CURRENT key has loaded, so a
  // key switch never writes the previous date's checks into the new key.
  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(checked));
    } catch {
      // quota / privacy mode — stays UI-only
    }
  }, [checked, loadedKey, storageKey]);

  const done = checked.filter(Boolean).length;
  const total = CHECKLIST_ITEM_KEYS.length;
  const pct = Math.round((done / total) * 100);

  function toggleItem(index: number) {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }

  function resetItems() {
    setChecked(CHECKLIST_ITEM_KEYS.map(() => false));
  }

  return (
    <section className="card-frame p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            {t(locale, "cashier.checklist.title")}
          </h2>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {t(locale, "cashier.checklist.progress", { done, total })} · {pct}%
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            done === total ? "bg-emerald-600" : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1">
        {CHECKLIST_ITEM_KEYS.map((key, index) => (
          <li key={key}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50">
              <input
                type="checkbox"
                checked={checked[index] === true}
                onChange={() => toggleItem(index)}
                className="mt-0.5 h-4 w-4 accent-emerald-600"
              />
              <span
                className={`text-sm ${
                  checked[index]
                    ? "text-slate-400 line-through"
                    : "text-slate-700"
                }`}
              >
                {t(locale, key)}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">
          {t(locale, "cashier.checklist.note")}
        </p>
        <button
          type="button"
          onClick={resetItems}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-700"
        >
          <RotateCcw className="h-3 w-3" />
          {t(locale, "cashier.checklist.reset")}
        </button>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------
// IT status widget — static demo badges (no live APIs in M7)
// ----------------------------------------------------------------------

const DEMO_STATUS_ROWS: { key: string; icon: LucideIcon; state: "ok" | "watch" }[] =
  [
    { key: "cashier.itstatus.foodics", icon: Monitor, state: "ok" },
    { key: "cashier.itstatus.mada", icon: CreditCard, state: "watch" },
    { key: "cashier.itstatus.printer", icon: Printer, state: "ok" },
  ];

export function ItStatusWidget({ locale }: { locale: Locale }) {
  return (
    <section className="card-frame p-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-slate-900">
          {t(locale, "cashier.itstatus.title")}
        </h2>
      </div>
      <ul className="mt-3 space-y-2">
        {DEMO_STATUS_ROWS.map((row) => {
          const Icon = row.icon;
          const ok = row.state === "ok";
          return (
            <li
              key={row.key}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <Icon className="h-4 w-4 text-slate-400" />
                {t(locale, row.key)}
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  ok
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    ok ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {t(
                  locale,
                  ok ? "cashier.itstatus.ok" : "cashier.itstatus.watch",
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-400">
        {t(locale, "cashier.itstatus.demo")}
      </p>
    </section>
  );
}

// ----------------------------------------------------------------------
// IT ticket modal → INSERT it_support_tickets (Supabase required)
// ----------------------------------------------------------------------

const TICKET_CATEGORY_OPTIONS: { value: TicketCategory; labelKey: string }[] = [
  { value: "pos", labelKey: "ticket.category.pos" },
  { value: "mada", labelKey: "ticket.category.mada" },
  { value: "printer", labelKey: "ticket.category.printer" },
  { value: "network", labelKey: "ticket.category.network" },
  { value: "foodics", labelKey: "ticket.category.foodics" },
  { value: "other", labelKey: "ticket.category.other" },
];

const TICKET_PRIORITY_OPTIONS: { value: TicketPriority; labelKey: string }[] = [
  { value: "low", labelKey: "ticket.priority.low" },
  { value: "normal", labelKey: "ticket.priority.normal" },
  { value: "high", labelKey: "ticket.priority.high" },
  { value: "urgent", labelKey: "ticket.priority.urgent" },
];

const MODAL_INPUT_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export function ItTicketModal({
  locale,
  branchId,
  branchName,
  createdByRole = "cashier",
  onClose,
  onCreated,
}: {
  locale: Locale;
  branchId: string;
  branchName?: string;
  createdByRole?: string;
  onClose: () => void;
  onCreated?: (ticket: ItSupportTicket) => void;
}) {
  const [category, setCategory] = useState<TicketCategory>("pos");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ItSupportTicket | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (created || submitting) return;
    if (subject.trim() === "" || description.trim() === "") {
      setError(t(locale, "ticket.error.required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await createTicket({
        branchId,
        category,
        priority,
        subject: subject.trim(),
        description: description.trim(),
        createdByRole,
        createdByLabel: branchName,
      });
      setCreated(ticket);
      onCreated?.(ticket);
    } catch (err) {
      setError(
        err instanceof Error && err.message === TICKETS_NOT_CONFIGURED
          ? t(locale, "ticket.error.notConfigured")
          : t(locale, "ticket.error.request"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, "ticket.title")}
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="card-frame w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <LifeBuoy className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {t(locale, "ticket.title")}
              </h2>
              <p className="text-xs text-slate-500">
                {t(locale, "ticket.branch")}:{" "}
                <span className="font-medium text-slate-700">
                  {branchId}
                  {branchName ? ` — ${branchName}` : ""}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, "common.close")}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {created ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {t(locale, "ticket.success.title")}
            </h3>
            <p className="text-sm text-slate-600">
              {t(locale, "ticket.success.id")}{" "}
              <span className="font-mono font-semibold">{created.id}</span>
            </p>
            <p className="text-xs text-slate-500">
              {t(locale, "ticket.success.note")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {t(locale, "common.close")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ticket-category"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  {t(locale, "ticket.category")}
                </label>
                <select
                  id="ticket-category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as TicketCategory)
                  }
                  className={MODAL_INPUT_CLASS}
                >
                  {TICKET_CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(locale, o.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="ticket-priority"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  {t(locale, "ticket.priority")}
                </label>
                <select
                  id="ticket-priority"
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as TicketPriority)
                  }
                  className={MODAL_INPUT_CLASS}
                >
                  {TICKET_PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(locale, o.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label
                htmlFor="ticket-subject"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                {t(locale, "ticket.subject")}
              </label>
              <input
                id="ticket-subject"
                type="text"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t(locale, "ticket.subjectPlaceholder")}
                className={MODAL_INPUT_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor="ticket-description"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                {t(locale, "ticket.description")}
              </label>
              <textarea
                id="ticket-description"
                rows={4}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t(locale, "ticket.descriptionPlaceholder")}
                className={`${MODAL_INPUT_CLASS} resize-y`}
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {t(locale, "common.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t(locale, "ticket.submitting")}
                  </>
                ) : (
                  t(locale, "ticket.submit")
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
