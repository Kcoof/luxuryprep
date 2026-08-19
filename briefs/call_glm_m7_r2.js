// M7 R2 — complete truncated files; thinking disabled
const fs = require("fs");
const https = require("https");

function loadSec() {
  if (!fs.existsSync(".sec")) return;
  for (const line of fs.readFileSync(".sec", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadSec();

const brief = fs.readFileSync("briefs/M7_REVISION_R2.md", "utf8");

// Provide original cashier + admin + login + foundation + new deps from staged
const contextPaths = [
  "briefs/M7_STAGED/app/lib/i18n.ts",
  "briefs/M7_STAGED/app/lib/tickets.ts",
  "briefs/M7_STAGED/app/types/index.ts",
  "briefs/M7_STAGED/app/components/locale-toggle.tsx",
  "briefs/M7_STAGED/app/cashier/dashboard-sections.tsx",
  "briefs/M7_STAGED/_TRUNCATED_app__cashier__page.tsx",
  "app/cashier/page.tsx", // pre-M7 original as reference for any missing tail logic
  "app/admin/page.tsx",
  "app/login-form.tsx",
  "app/page.tsx",
  "app/lib/auth.ts",
  "FOUNDATION.md",
];

const context = contextPaths
  .filter((p) => fs.existsSync(p))
  .map((p) => {
    let body = fs.readFileSync(p, "utf8");
    // Cap original cashier if truncated companion exists — still useful for tail
    if (p === "app/cashier/page.tsx" && body.length > 80000) {
      body = body.slice(0, 80000) + "\n/* …truncated for prompt size… */\n";
    }
    return "===CURRENT FILE: " + p + "===\n" + body + "\n===END===";
  })
  .join("\n\n");

const system =
  "You are GLM authoring M7 round 2 under the Model Constitution. " +
  "thinking is disabled. Output ONLY full file bodies with ===FILE=== / ===ENDFILE===. " +
  "No markdown. No commentary. Finish incomplete cashier page + admin + login + FOUNDATION. " +
  "End with END_M7.";

const payload = JSON.stringify({
  model: process.env.GLM_MODEL || "glm-5.3",
  messages: [
    { role: "system", content: system },
    { role: "user", content: brief + "\n\n## Context\n\n" + context },
  ],
  temperature: 0.1,
  max_tokens: 64000,
  thinking: { type: "enabled" },
  reasoning_effort: process.env.GLM_REASONING_EFFORT || "low",
});

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
      fs.writeFileSync("briefs/M7_GLM_R2_HTTP.json", data, "utf8");
      console.log(
        "STATUS=" + res.statusCode + "  latency=" + (Date.now() - started) + "ms",
      );
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 2000));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const choice = parsed.choices[0];
      const text = choice.message.content || "";
      fs.writeFileSync("briefs/M7_GLM_R2_RAW.txt", text, "utf8");
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
