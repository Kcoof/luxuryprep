const fs = require("fs");

const KEYS = `
  "wizard.step1.tip": {
    ar: "نصيحة: ارفق تقرير Z من Foodics وصور إثباتات المدفوعات لتسريع المراجعة والتدقيق.",
    en: "Tip: attach the Foodics Z-report and payment proof photos to speed up review and auditing.",
  },
  "wizard.step1.basicTitle": {
    ar: "البيانات الأساسية للتقرير",
    en: "Basic report data",
  },
  "wizard.step1.cashHanded": {
    ar: "النقد المسلَّم فعليًا (ر.س) — اختياري",
    en: "Actual cash handed (SAR) — optional",
  },
  "wizard.step1.zreportTitle": {
    ar: "تقرير Z من Foodics",
    en: "Foodics Z-report",
  },
  "wizard.step1.zreportDrop": {
    ar: "اسحب صورة تقرير Z هنا أو اضغط للاختيار",
    en: "Drop the Z-report photo here or tap to browse",
  },
  "wizard.step1.zreportHint": {
    ar: "JPG / PNG / WEBP / HEIC",
    en: "JPG / PNG / WEBP / HEIC",
  },
  "wizard.step1.attached": { ar: "تم الإرفاق", en: "Attached" },
  "wizard.step1.replace": { ar: "استبدال", en: "Replace" },
  "wizard.step1.proofsTitle": {
    ar: "إثباتات المدفوعات",
    en: "Payment proofs",
  },
  "wizard.step1.proofMada": { ar: "مدى", en: "Mada" },
  "wizard.step1.proofCash": {
    ar: "إيصال / قسيمة إيداع النقد",
    en: "Cash deposit / receipt",
  },
  "wizard.step1.proofVisa": { ar: "فيزا", en: "Visa" },
  "wizard.step1.optional": { ar: "اختياري", en: "Optional" },
  "wizard.step1.addImage": { ar: "إضافة صورة", en: "Add image" },
  "wizard.step1.cta": {
    ar: "استخراج القيم والاستمرار إلى التأكيد",
    en: "Extract & continue to confirmation",
  },
`;

let live = fs.readFileSync("app/lib/i18n.ts", "utf8");
if (live.includes("wizard.step1.tip")) {
  console.log("keys already present");
} else {
  const re = /("wizard\.step1\.title": \{[\s\S]*?\},\r?\n)/;
  if (!re.test(live)) throw new Error("anchor wizard.step1.title missing");
  live = live.replace(re, (m) => m + KEYS);
  fs.writeFileSync("app/lib/i18n.ts", live, "utf8");
  console.log("inserted step1 keys");
}

fs.copyFileSync(
  "briefs/CLOSING_STEP1_STAGED/app/cashier/page.tsx",
  "app/cashier/page.tsx",
);
fs.copyFileSync(
  "briefs/CLOSING_STEP1_STAGED/briefs/CLOSING_STEP1_I18N_KEYS.md",
  "briefs/CLOSING_STEP1_I18N_KEYS.md",
);
console.log("copied page");
