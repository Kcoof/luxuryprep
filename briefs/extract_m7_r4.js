const fs = require("fs");
const path = require("path");
const raw = fs.readFileSync("briefs/M7_GLM_R4_RAW.txt", "utf8");
const outRoot = "briefs/M7_STAGED";
const patterns = [
  /^===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)^===ENDFILE===$/gm,
  /^===FILE===\s*(.+?)\s*\r?\n([\s\S]*?)^===ENDFILE===$/gm,
];
let written = [];
for (const re of patterns) {
  let m;
  while ((m = re.exec(raw)) !== null) {
    let rel = m[1].trim().replace(/\\/g, "/");
    if (rel.startsWith("briefs/M7_STAGED/")) rel = rel.slice("briefs/M7_STAGED/".length);
    const body = m[2].replace(/\r\n/g, "\n").replace(/\n$/, "") + "\n";
    const dest = path.join(outRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, body, "utf8");
    written.push(rel + " (" + body.length + ")");
  }
  if (written.length) break;
}
console.log(written.join("\n"));
