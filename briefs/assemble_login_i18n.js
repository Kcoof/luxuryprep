const fs = require("fs");
let live = fs.readFileSync("app/lib/i18n.ts", "utf8");
if (!live.includes("login.portalHint")) {
  const hint =
    '  "login.portalHint": {\n' +
    '    ar: "اختر بوابتك للمتابعة",\n' +
    '    en: "Choose your portal to continue",\n' +
    "  },\n";
  live = live.replace(
    /("login\.subtitle": \{ ar: "[^"]*", en: "[^"]*" \},\r?\n)/,
    (m) => m + hint,
  );
}
fs.writeFileSync("briefs/LOGIN_UX_STAGED/app/lib/i18n.ts", live, "utf8");
console.log("hasArabicHint", live.includes("اختر بوابتك"));
console.log("hasKey", live.includes("login.portalHint"));
console.log(
  "proofImageInvalid",
  /proofImageInvalid[\s\S]*?en: "([^"]+)"/.exec(live)?.[1],
);
