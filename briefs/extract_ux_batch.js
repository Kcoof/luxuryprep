const fs = require("fs");
const path = require("path");
const raw = fs.readFileSync("briefs/UX_BATCH_GLM_RAW.txt", "utf8");
const out = "briefs/UX_BATCH_STAGED";
const re = /^===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)^===ENDFILE===$/gm;
let m;
const written = [];
while ((m = re.exec(raw)) !== null) {
  let rel = m[1].trim().replace(/\\/g, "/");
  if (rel.startsWith("briefs/UX_BATCH_STAGED/")) {
    rel = rel.slice("briefs/UX_BATCH_STAGED/".length);
  }
  const body = m[2].replace(/\r\n/g, "\n").replace(/\n$/, "") + "\n";
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body, "utf8");
  written.push(rel + " (" + body.length + ")");
}
console.log(written.join("\n"));
