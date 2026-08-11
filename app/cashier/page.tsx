import Link from "next/link";
import { ArrowRight, Calculator } from "lucide-react";

export default function CashierPage() {
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
        <Calculator className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-bold">شاشة الكاشير</h1>
        <p className="mt-2 text-slate-600">هيكل M1 — سيتوفر المعالج ثلاثي الخطوات في M2.</p>
      </div>
    </main>
  );
}
