// Cashier UX polish — GLM; thinking disabled; no full i18n regen
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

const brief = fs.readFileSync("briefs/CASHIER_UX_POLISH.md", "utf8");
const skill = fs.readFileSync(".cursor/skills/luxuryprep-ux-ui/SKILL.md", "utf8");
const paths = [
  "app/cashier/page.tsx",
  "app/cashier/dashboard-sections.tsx",
  "app/components/locale-toggle.tsx",
  "app/globals.css",
  "app/login-form.tsx", // reference for polish patterns only
];

const context = paths
  .filter((p) => fs.existsSync(p))
  .map((p) => {
    const body = fs.readFileSync(p, "utf8");
    return "===CURRENT FILE: " + p + "===\n" + body + "\n===END===";
  })
  .join("\n\n");

const system =
  "You are GLM authoring cashier UX polish under Model Constitution + luxuryprep-ux-ui. " +
  "thinking disabled. Do NOT regenerate app/lib/i18n.ts. Do not change closing business logic. " +
  "Output ONLY ===FILE: path=== / ===ENDFILE=== full bodies. End with END_CASHIER_UX.";

const payload = JSON.stringify({
  model: process.env.GLM_MODEL || "glm-5.3",
  messages: [
    { role: "system", content: system },
    {
      role: "user",
      content:
        brief + "\n\n## UX skill\n" + skill + "\n\n## Current files\n" + context,
    },
  ],
  temperature: 0.2,
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
      fs.writeFileSync("briefs/CASHIER_UX_GLM_HTTP.json", data, "utf8");
      console.log(
        "STATUS=" + res.statusCode + " latency=" + (Date.now() - started) + "ms",
      );
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 2000));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const text = parsed.choices[0].message.content || "";
      fs.writeFileSync("briefs/CASHIER_UX_GLM_RAW.txt", text, "utf8");
      console.log("FINISH=" + parsed.choices[0].finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CONTENT_CHARS=" + text.length);
      console.log("HAS_END=" + /END_CASHIER_UX/.test(text));
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
