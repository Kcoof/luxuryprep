"use client";

// M7 — AR|EN locale toggle (luxuryprep).
// UX polish: 44px touch targets for one-handed branch use, focus-visible
// rings, and a quiet segmented-control look shared with the login gateway.
// Purely presentational: the owning page persists the choice via
// app/lib/i18n.ts (`luxuryprep_locale`) and re-renders with the new dir.

import type { Locale } from "../lib/i18n";

const BASE_BUTTON_CLASS =
  "flex min-h-11 items-center justify-center rounded-lg px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40";

export default function LocaleToggle({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (next: Locale) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1"
      role="group"
      aria-label="Language / اللغة"
    >
      <button
        type="button"
        aria-pressed={locale === "ar"}
        onClick={() => onChange("ar")}
        className={`${BASE_BUTTON_CLASS} ${
          locale === "ar"
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        }`}
      >
        عربي
      </button>
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => onChange("en")}
        className={`${BASE_BUTTON_CLASS} ${
          locale === "en"
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        }`}
      >
        EN
      </button>
    </div>
  );
}
