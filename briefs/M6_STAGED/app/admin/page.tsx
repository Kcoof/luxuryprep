"use client";

// M6 — IT admin shell (luxuryprep). Ready for future features.
// NOTE: no Firebase anything here — and no fake connection settings.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Info,
  Loader2,
  LogOut,
  Server,
  ShieldCheck,
} from "lucide-react";
import { clearSession, requireRole, type Session } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";

function formatLoginTime(iso: string): string {
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

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // M6: gateway guard — admin session required.
  useEffect(() => {
    const s = requireRole("admin");
    if (!s) {
      router.replace("/");
      return;
    }
    setSession(s);
    setAuthChecked(true);
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace("/");
  }

  if (!authChecked) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-slate-50"
        dir="rtl"
      >
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">جارٍ التحقق من الجلسة…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50" dir="rtl">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </button>
            <div className="flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-sm font-medium">luxuryprep · مسؤول IT</span>
            </div>
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            لوحة مسؤول IT
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            بوابة الإغلاق المالي والمراجعة — إدارة النظام والتهيئة.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            لوحة مسؤول IT — جاهزة للميزات القادمة
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            هذه اللوحة هيكل جاهز. أدوات إدارة المستخدمين والفروع والصلاحيات
            ستُضاف في الميزات القادمة — لا توجد إعدادات مفعّلة في هذا الإصدار.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-semibold">الجلسة الحالية</span>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">الدور</dt>
                <dd className="font-medium text-slate-900">مسؤول IT</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">تسجيل الدخول</dt>
                <dd className="font-medium text-slate-900">
                  {session ? formatLoginTime(session.at) : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-slate-700">
              <Server className="h-4 w-4" />
              <span className="text-sm font-semibold">حالة Supabase</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">متغيرات البيئة</span>
              {isSupabaseConfigured ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  مُهيّأة
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  غير مُهيّأة
                </span>
              )}
            </div>
            <p className="mt-2 flex items-start gap-1 text-xs text-slate-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              قراءة فقط لوجود متغيرات NEXT_PUBLIC_SUPABASE_* — لا يُفتح أي اتصال
              من هذه اللوحة.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}