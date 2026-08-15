const fs = require("fs");
const path = require("path");

const keys = {
  "cashier.prep.title": {
    ar: "تحضيرات ما قبل الإقفال",
    en: "Pre-closing prep",
  },
  "wizard.steps.status": {
    ar: "الخطوة {current} من {total}",
    en: "Step {current} of {total}",
  },
};

let live = fs.readFileSync("app/lib/i18n.ts", "utf8");

function insertAfter(anchorPattern, block) {
  if (live.includes(block.split("\n")[0])) return;
  if (!anchorPattern.test(live)) {
    throw new Error("anchor not found: " + anchorPattern);
  }
  live = live.replace(anchorPattern, (m) => m + block);
}

if (!live.includes('"cashier.prep.title"')) {
  // After cashier.dashboard.title block
  insertAfter(
    /("cashier\.dashboard\.title": \{[\s\S]*?\},\r?\n)/,
    '  "cashier.prep.title": {\n' +
      '    ar: "تحضيرات ما قبل الإقفال",\n' +
      '    en: "Pre-closing prep",\n' +
      "  },\n",
  );
}

if (!live.includes('"wizard.steps.status"')) {
  insertAfter(
    /("wizard\.title": \{[\s\S]*?\},\r?\n)/,
    '  "wizard.steps.status": {\n' +
      '    ar: "الخطوة {current} من {total}",\n' +
      '    en: "Step {current} of {total}",\n' +
      "  },\n",
  );
}

fs.writeFileSync("app/lib/i18n.ts", live, "utf8");
console.log("i18n keys ok", live.includes("cashier.prep.title"), live.includes("wizard.steps.status"));

const copies = [
  ["briefs/CASHIER_UX_STAGED/app/cashier/page.tsx", "app/cashier/page.tsx"],
  [
    "briefs/CASHIER_UX_STAGED/app/cashier/dashboard-sections.tsx",
    "app/cashier/dashboard-sections.tsx",
  ],
  [
    "briefs/CASHIER_UX_STAGED/app/components/locale-toggle.tsx",
    "app/components/locale-toggle.tsx",
  ],
  ["briefs/CASHIER_UX_STAGED/app/globals.css", "app/globals.css"],
];
for (const [from, to] of copies) {
  fs.copyFileSync(from, to);
  console.log("copied", to);
}

// Move i18n keys doc to briefs root if nested
const nested = "briefs/CASHIER_UX_STAGED/briefs/CASHIER_UX_I18N_KEYS.md";
if (fs.existsSync(nested)) {
  fs.copyFileSync(nested, "briefs/CASHIER_UX_I18N_KEYS.md");
}
