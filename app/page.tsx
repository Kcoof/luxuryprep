import Link from "next/link";
import { Calculator, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-slate-900">
          نظام الإغلاق المالي اليومي ومراجعة الفروع
        </h1>
        <p className="mt-2 text-slate-600">
          اختر الشاشة للمتابعة — هياكل M1 فقط (لا توجد ميزات بعد).
        </p>
      </header>

      <nav className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/cashier"
          className="card-frame flex items-center gap-3 p-6 hover:border-emerald-400"
        >
          <Calculator className="h-8 w-8 text-emerald-600" />
          <span className="text-lg font-semibold">شاشة الكاشير</span>
        </Link>

        <Link
          href="/auditor"
          className="card-frame flex items-center gap-3 p-6 hover:border-amber-400"
        >
          <ShieldCheck className="h-8 w-8 text-amber-600" />
          <span className="text-lg font-semibold">الإدارة المالية والمراجعة</span>
        </Link>
      </nav>
    </main>
  );
}
