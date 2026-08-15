const fs = require("fs");
const path = require("path");

const copies = [
  ["briefs/UX_BATCH_STAGED/app/cashier/page.tsx", "app/cashier/page.tsx"],
  ["briefs/UX_BATCH_STAGED/app/auditor/page.tsx", "app/auditor/page.tsx"],
  ["briefs/UX_BATCH_STAGED/app/admin/page.tsx", "app/admin/page.tsx"],
];
for (const [from, to] of copies) {
  fs.copyFileSync(from, to);
  console.log("copied", to, fs.statSync(to).size);
}

const nested = "briefs/UX_BATCH_STAGED/briefs/UX_BATCH_I18N_KEYS.md";
if (fs.existsSync(nested)) {
  fs.copyFileSync(nested, "briefs/UX_BATCH_I18N_KEYS.md");
  console.log("copied i18n keys doc");
}

// Quick sanity: no stray netSales quote
const cashier = fs.readFileSync("app/cashier/page.tsx", "utf8");
console.log("badNetSalesQuote", /netSales"\}/.test(cashier));
console.log("hasAiNoticeKind", cashier.includes("aiNoticeKind"));
console.log("hasFieldIds", cashier.includes('id="field-grossSales"'));
