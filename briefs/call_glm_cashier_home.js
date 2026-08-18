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
const brief = fs.readFileSync("briefs/CASHIER_HOME_RESTYLE.md", "utf8");
const skill = fs.readFileSync(".cursor/skills/luxuryprep-ux-ui/SKILL.md", "utf8");
const paths = [
  "app/cashier/page.tsx",
  "app/cashier/dashboard-sections.tsx",
  "app/components/locale-toggle.tsx",
  "app/globals.css",
];
const context = paths
  .filter((p) => fs.existsSync(p))
  .map(
    (p) =>
      "===CURRENT FILE: " +
      p +
      "===\n" +
      fs.readFileSync(p, "utf8") +
      "\n===END===",
  )
  .join("\n\n");
const payload = JSON.stringify({
  model: process.env.GLM_MODEL || "GLM-5.2",
  messages: [
    {
      role: "system",
      content:
        "GLM cashier home restyle. thinking disabled. Brand luxuryprep only. " +
        "Do NOT regenerate i18n.ts — put new keys in briefs/CASHIER_HOME_I18N_KEYS.md. " +
        "Do not change closing business logic. Output ===FILE=== / ===ENDFILE===. End END_CASHIER_HOME.",
    },
    {
      role: "user",
      content:
        brief + "\n\n## Skill\n" + skill + "\n\n## Files\n" + context,
    },
  ],
  temperature: 0.2,
  max_tokens: 64000,
  thinking: { type: "disabled" },
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
      fs.writeFileSync("briefs/CASHIER_HOME_GLM_HTTP.json", data, "utf8");
      console.log("STATUS=" + res.statusCode + " latency=" + (Date.now() - started));
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 2000));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const text = parsed.choices[0].message.content || "";
      fs.writeFileSync("briefs/CASHIER_HOME_GLM_RAW.txt", text, "utf8");
      console.log("FINISH=" + parsed.choices[0].finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CHARS=" + text.length);
      console.log("HAS_END=" + /END_CASHIER_HOME/.test(text));
      const files = [...text.matchAll(/^===FILE:\s*(.+?)\s*===$/gm)].map(
        (m) => m[1],
      );
      const ends = (text.match(/^===ENDFILE===$/gm) || []).length;
      console.log("FILES(" + files.length + "/" + ends + "): " + files.join(", "));
    });
  },
);
req.on("error", (e) => {
  console.log("ERR=" + e.message);
  process.exit(1);
});
req.write(payload);
req.end();
