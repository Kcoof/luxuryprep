// M7 authoring — cashier dashboard + bilingual + IT tickets
const fs = require("fs");
const https = require("https");

function loadSec() {
  if (!fs.existsSync(".sec")) return;
  const lines = fs.readFileSync(".sec", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadSec();

const brief = fs.readFileSync("briefs/M7_DASHBOARD.md", "utf8");
const planned = fs.existsSync("supabase/PLANNED_006_it_tickets.md")
  ? fs.readFileSync("supabase/PLANNED_006_it_tickets.md", "utf8")
  : "";

const context = [
  "app/page.tsx",
  "app/login-form.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "app/lib/supabase.ts",
  "app/lib/auth.ts",
  "app/lib/branches.ts",
  "app/types/index.ts",
  "app/cashier/page.tsx",
  "app/admin/page.tsx",
  "supabase/migrations/005_auditor.sql",
  "supabase/CUTOVER.md",
  "FOUNDATION.md",
]
  .filter((p) => fs.existsSync(p))
  .map((p) => {
    const body = fs.readFileSync(p, "utf8");
    return "===CURRENT FILE: " + p + "===\n" + body + "\n===END===";
  })
  .join("\n\n");

const system =
  "You are GLM authoring milestone M7 under the Model Constitution. " +
  "Output ONLY full file bodies delimited by ===FILE: path=== and ===ENDFILE===. " +
  "No markdown fences. No diffs. No commentary. No Firebase. Brand luxuryprep. " +
  "Bilingual Arabic+English required for new UI. Do not rebuild closing wizard logic. " +
  "Finish with END_M7.";

const payload = JSON.stringify({
  model: process.env.GLM_MODEL || "GLM-5.2",
  messages: [
    { role: "system", content: system },
    {
      role: "user",
      content:
        brief +
        "\n\n## Planned schema (authoritative)\n\n" +
        planned +
        "\n\n## Current repository files\n\n" +
        context,
    },
  ],
  temperature: 0.1,
  max_tokens: 64000,
});

if (!process.env.GLM_API_KEY || !process.env.GLM_BASE_URL) {
  console.error("Missing GLM_API_KEY or GLM_BASE_URL (.sec)");
  process.exit(1);
}

const url = new URL(
  process.env.GLM_BASE_URL.replace(/\/$/, "") + "/chat/completions",
);
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
      fs.writeFileSync("briefs/M7_GLM_HTTP.json", data, "utf8");
      console.log(
        "STATUS=" + res.statusCode + "  latency=" + (Date.now() - started) + "ms",
      );
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const choice = parsed.choices[0];
      const text = choice.message.content || "";
      fs.writeFileSync("briefs/M7_GLM_RAW.txt", text, "utf8");
      console.log("FINISH=" + choice.finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CONTENT_CHARS=" + text.length);
      console.log("HAS_END_M7=" + /END_M7/.test(text));
      const files = [...text.matchAll(/^===FILE:\s*(.+?)\s*===$/gm)].map(
        (m) => m[1],
      );
      const ends = (text.match(/^===ENDFILE===$/gm) || []).length;
      console.log(
        "FILES(" + files.length + "/" + ends + " closed): " + files.join(", "),
      );
    });
  },
);

req.on("error", (e) => {
  console.log("ERR=" + e.message);
  process.exit(1);
});
req.write(payload);
req.end();
