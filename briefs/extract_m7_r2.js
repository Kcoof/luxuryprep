// Merge M7 R2 output into briefs/M7_STAGED with correct app-relative paths
const fs = require("fs");
const path = require("path");

const raw = fs.readFileSync("briefs/M7_GLM_R2_RAW.txt", "utf8");
const outRoot = "briefs/M7_STAGED";
const re = /^===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)^===ENDFILE===$/gm;
let m;
const written = [];
while ((m = re.exec(raw)) !== null) {
  let rel = m[1].trim().replace(/\\/g, "/");
  // Strip accidental briefs/M7_STAGED/ prefix
  if (rel.startsWith("briefs/M7_STAGED/")) {
    rel = rel.slice("briefs/M7_STAGED/".length);
  }
  const body = m[2].replace(/\r\n/g, "\n").replace(/\n$/, "") + "\n";
  const dest = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body, "utf8");
  written.push(rel + " (" + body.length + " chars)");
}
console.log(written.join("\n"));
