import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "الإغلاق المالي اليومي ومراجعة الفروع",
  description:
    "نظام الإغلاق المالي اليومي والمراجعة لفروع التجزئة والمطاعم في المملكة العربية السعودية",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
