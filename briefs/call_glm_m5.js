// M5 authoring — docs/seed cutover
const fs = require("fs");
const https = require("https");

const brief = fs.readFileSync("briefs/M5_CUTOVER.md", "utf8");

const context = [
  "FOUNDATION.md",
  ".env.local.example",
  ".sec.example",
  "supabase/BRANCHES.md",
  "supabase/seed_branches.json",
  "supabase/migrations/001_branches.sql",
  "package.json",
]
  .filter((p) => fs.existsSync(p))
  .map((p) => "===CURRENT FILE: " + p + "===\n" + fs.readFileSync(p, "utf8") + "\n===END===")
  .join("\n\n");

const system =
  "You are GLM authoring milestone M5 under the Model Constitution. " +
  "Output ONLY full file bodies delimited by ===FILE: path=== and ===ENDFILE===. " +
  "No markdown fences. No diffs. No commentary. Docs and SQL only — no app feature rewrites. " +
  "Finish with END_M5.";

const payload = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user", content: brief + "\n\n## Current files\n\n" + context },
  ],
  temperature: 0.1,
  max_tokens: 32000,
});

const url = new URL(process.env.GLM_BASE_URL.replace(/\/$/, "") + "/chat/completions");
const started = Date.now();

const req = https.request(
  {
    hostname: url.hostname,
    path: url.pathname,
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.GLM_API_KEY,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
    timeout: 0,
  },
  (res) => {
    let data = "";
    res.setEncoding("utf8");
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      fs.writeFileSync("briefs/M5_GLM_HTTP.json", data, "utf8");
      console.log("STATUS=" + res.statusCode + "  latency=" + (Date.now() - started) + "ms");
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const choice = parsed.choices[0];
      const text = choice.message.content || "";
      fs.writeFileSync("briefs/M5_GLM_RAW.txt", text, "utf8");
      console.log("FINISH=" + choice.finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CONTENT_CHARS=" + text.length);
      console.log("HAS_END_M5=" + /END_M5/.test(text));
      const files = [...text.matchAll(/^===FILE:\s*(.+?)\s*===$/gm)].map((m) => m[1]);
      const ends = (text.match(/^===ENDFILE===$/gm) || []).length;
      console.log("FILES(" + files.length + "/" + ends + " closed): " + files.join(", "));
    });
  },
);

req.on("error", (e) => {
  console.log("ERR=" + e.message);
  process.exit(1);
});
req.write(payload);
req.end();
