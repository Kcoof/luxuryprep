// Extracts ===FILE: path=== / ===ENDFILE=== blocks from a GLM response into a
// staging tree. Staging, not the worktree: the Model Constitution requires
// Claude and Codex review before anything is applied.
const fs = require("fs");
const path = require("path");

const src = process.argv[2] || "briefs/M3_GLM_RAW.txt";
const outRoot = process.argv[3] || "briefs/M3_STAGED";

const text = fs.readFileSync(src, "utf8");
const re = /^===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)\r?\n===ENDFILE===/gm;

let m;
let count = 0;
while ((m = re.exec(text)) !== null) {
  const rel = m[1].trim().replace(/^[/\\]+/, "");
  let content = m[2];

  // GLM sometimes wraps a whole file in a fence despite instructions.
  const fenced = content.match(/^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```\s*$/);
  const wasFenced = Boolean(fenced);
  if (fenced) content = fenced[1];

  const dest = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, "utf8");

  const innerFence = /^```/m.test(content);
  console.log(
    rel.padEnd(46) +
      String(content.split(/\r?\n/).length).padStart(5) + " lines" +
      (wasFenced ? "  [outer fence stripped]" : "") +
      (innerFence ? "  [WARNING: fence remains inside]" : ""),
  );
  count++;
}
console.log("\nextracted " + count + " file(s) to " + outRoot);
