const fs = require("fs");

const NEW_KEYS = `
  "cashier.home.greetingMorning": { ar: "صباح الخير", en: "Good morning" },
  "cashier.home.greetingAfternoon": { ar: "طاب يومك", en: "Good afternoon" },
  "cashier.home.greetingEvening": { ar: "مساء الخير", en: "Good evening" },
  "cashier.home.question": {
    ar: "كيف حالة الأجهزة والأنظمة في فرعك اليوم؟",
    en: "How are your devices and systems at your branch today?",
  },
  "cashier.home.card.checklist.title": {
    ar: "قائمة ما قبل الإقفال",
    en: "Pre-close checklist",
  },
  "cashier.home.card.it.title": { ar: "الدعم الفني", en: "IT support" },
  "cashier.home.card.it.cta": {
    ar: "فتح تذكرة دعم فني",
    en: "Open an IT ticket",
  },
  "cashier.home.closing.title": {
    ar: "الإقفال المالي اليومي",
    en: "Daily financial closing",
  },
  "cashier.home.closing.subtitle": {
    ar: "ابدأ خطوات الإقفال الثلاث وأرسل التقرير اليومي",
    en: "Start the 3-step closing and submit today's report",
  },
  "cashier.home.closing.cta": { ar: "ابدأ الإقفال", en: "Start closing" },
`;

let live = fs.readFileSync("app/lib/i18n.ts", "utf8");
if (live.includes("cashier.home.greetingMorning")) {
  console.log("keys already present");
} else {
  // Insert after cashier.dashboard.title block
  const re = /("cashier\.dashboard\.title": \{[^}]+\},\r?\n)/;
  if (!re.test(live)) throw new Error("anchor missing");
  live = live.replace(re, (m) => m + NEW_KEYS);
  fs.writeFileSync("app/lib/i18n.ts", live, "utf8");
  console.log("inserted home keys");
}

fs.copyFileSync(
  "briefs/CASHIER_HOME_STAGED/app/cashier/page.tsx",
  "app/cashier/page.tsx",
);
fs.copyFileSync(
  "briefs/CASHIER_HOME_STAGED/app/cashier/dashboard-sections.tsx",
  "app/cashier/dashboard-sections.tsx",
);
fs.copyFileSync(
  "briefs/CASHIER_HOME_STAGED/briefs/CASHIER_HOME_I18N_KEYS.md",
  "briefs/CASHIER_HOME_I18N_KEYS.md",
);
console.log("copied cashier files");
