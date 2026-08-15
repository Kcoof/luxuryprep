"use client";

// M7 — AR|EN locale toggle (luxuryprep).
// Purely presentational: the owning page persists the choice via
// app/lib/i18n.ts (`luxuryprep_locale`) and re-renders with the new dir.

import type { Locale } from "../lib/i18n";

const BASE_BUTTON_CLASS =
  "rounded-md px-2.5 py-1 text-xs font-semibold transition";

export default function LocaleToggle({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (next: Locale) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5"
      role="group"
      aria-label="Language / اللغة"
    >
      <button
        type="button"
        aria-pressed={locale === "ar"}
        onClick={() => onChange("ar")}
        className={`${BASE_BUTTON_CLASS} ${
          locale === "ar"
            ? "bg-emerald-600 text-white"
            : "text-slate-500 hover:text-slate-700"
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
            ? "bg-emerald-600 text-white"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        EN
      </button>
    </div>
  );
}
