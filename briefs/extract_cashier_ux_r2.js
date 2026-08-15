const fs = require("fs");
const raw = fs.readFileSync("briefs/CASHIER_UX_R2_RAW.txt", "utf8");
const start = raw.indexOf("===FILE: app/cashier/page.tsx===");
if (start < 0) {
  console.error("no file marker");
  process.exit(1);
}
let body = raw.slice(start + "===FILE: app/cashier/page.tsx===\n".length);
const endFile = body.search(/^===ENDFILE===$/m);
const endMark = body.search(/^END_CASHIER_UX\s*$/m);
let cut = body.length;
if (endFile >= 0) cut = Math.min(cut, endFile);
if (endMark >= 0) cut = Math.min(cut, endMark);
body = body.slice(0, cut).replace(/\r\n/g, "\n").replace(/\n$/, "") + "\n";
fs.writeFileSync("briefs/CASHIER_UX_STAGED/app/cashier/page.tsx", body, "utf8");
console.log("wrote", body.length);
console.log("netSalesOk", /value=\{rawValues\.netSales\}/.test(body));
console.log("badQuote", /netSales"\}/.test(body));
console.log(
  "aiSlate",
  /kind === "ai"[\s\S]{0,120}bg-slate-200/.test(body),
);
