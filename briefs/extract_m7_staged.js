// Extract closed ===FILE=== blocks from M7_GLM_RAW.txt into briefs/M7_STAGED
const fs = require("fs");
const path = require("path");

const raw = fs.readFileSync("briefs/M7_GLM_RAW.txt", "utf8");
const outRoot = "briefs/M7_STAGED";
fs.mkdirSync(outRoot, { recursive: true });

const re = /^===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)^===ENDFILE===$/gm;
let m;
const written = [];
while ((m = re.exec(raw)) !== null) {
  const rel = m[1].trim().replace(/\\/g, "/");
  const body = m[2].replace(/\r\n/g, "\n").replace(/\n$/, "");
  const dest = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body.endsWith("\n") ? body : body + "\n", "utf8");
  written.push(rel + " (" + body.length + " chars)");
}

// Also capture truncated open file if present
const open = raw.match(
  /^===FILE:\s*(.+?)\s*===\r?\n([\s\S]*)$/m,
);
// Better: find last FILE without ENDFILE after it
const parts = raw.split(/^===FILE:\s*/m).slice(1);
const truncated = [];
for (const part of parts) {
  const nl = part.indexOf("\n");
  const filePath = part.slice(0, nl).replace(/\s*===$/, "").trim();
  const rest = part.slice(nl + 1);
  if (!/^===ENDFILE===$/m.test(rest) || !rest.includes("===ENDFILE===")) {
    // check properly
  }
  const endIdx = rest.search(/^===ENDFILE===$/m);
  if (endIdx === -1) {
    const dest = path.join(outRoot, "_TRUNCATED_" + filePath.replace(/\//g, "__"));
    fs.writeFileSync(dest, rest, "utf8");
    truncated.push(filePath + " (" + rest.length + " chars)");
  }
}

console.log("WRITTEN:\n" + written.join("\n"));
console.log("TRUNCATED:\n" + (truncated.join("\n") || "(none)"));
