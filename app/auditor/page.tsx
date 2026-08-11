import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function AuditorPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowRight className="h-4 w-4" />
        العودة للرئيسية
      </Link>

      <div className="card-frame p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="mt-4 text-2xl font-bold">الإدارة المالية والمراجعة</h1>
        <p className="mt-2 text-slate-600">هيكل M1 — ستبدأ التبويبات (الاعتماد / التقارير / سجل التدقيق) في M4.</p>
      </div>
    </main>
  );
}
