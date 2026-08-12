// Extracts parseLocalizedNumber() from a staged cashier page and runs the money
// cases through it. Money parsing is the one place a silent bug is unrecoverable,
// so it gets a real test rather than a code read.
const fs = require("fs");

const src = fs.readFileSync(
  process.argv[2] || "briefs/M3_STAGED_R2/app/cashier/page.tsx",
  "utf8",
);

const start = src.indexOf("function parseLocalizedNumber");
if (start < 0) throw new Error("parseLocalizedNumber not found");

// Walk braces to find the end of the function body.
let depth = 0;
let end = -1;
for (let i = src.indexOf("{", start); i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}

const body = src.slice(start, end).replace(/:\s*string\b/g, "").replace(/:\s*number \| null\b/g, "");
const parseLocalizedNumber = new Function(body + "; return parseLocalizedNumber;")();

const CASES = [
  ["1234", 1234],
  ["1234.50", 1234.5],
  ["1,234.50", 1234.5],
  ["1.234,50", 1234.5],
  ["1,234", 1234],
  ["12,5", 12.5],
  ["\u0661\u0662\u0663\u066b\u0665\u0660", 123.5],           // ١٢٣٫٥٠
  ["\u0661\u066c\u0662\u0663\u0664\u066b\u0665\u0660", 1234.5], // ١٬٢٣٤٫٥٠
  ["-25.00", -25],
  ["0", 0],
];

let pass = 0;
console.log("input                 expected        got             ok");
for (const [input, expected] of CASES) {
  const got = parseLocalizedNumber(input);
  const ok = got === expected;
  if (ok) pass++;
  console.log(
    JSON.stringify(input).padEnd(22) +
      String(expected).padEnd(16) +
      String(got).padEnd(16) +
      (ok ? "OK" : "FAIL" + (typeof got === "number" && expected !== 0
        ? "  (x" + (got / expected).toFixed(0) + ")" : "")),
  );
}
console.log("\n" + pass + "/" + CASES.length + " passing");
