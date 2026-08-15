const fs = require("fs");
const path = require("path");
const raw = fs.readFileSync("briefs/LOGIN_UX_GLM_RAW.txt", "utf8");
const out = "briefs/LOGIN_UX_STAGED";
const re = /^===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)^===ENDFILE===$/gm;
let m;
while ((m = re.exec(raw)) !== null) {
  const rel = m[1].trim().replace(/\\/g, "/");
  const body = m[2].replace(/\r\n/g, "\n").replace(/\n$/, "") + "\n";
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body, "utf8");
  console.log(rel + " (" + body.length + ")");
}
