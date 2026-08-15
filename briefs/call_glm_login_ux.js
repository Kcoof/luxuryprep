// Login UX polish — GLM author; thinking disabled
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

const brief = fs.readFileSync("briefs/LOGIN_UX_POLISH.md", "utf8");
const skill = fs.readFileSync(".cursor/skills/luxuryprep-ux-ui/SKILL.md", "utf8");
const paths = [
  "app/login-form.tsx",
  "app/components/locale-toggle.tsx",
  "app/globals.css",
  "app/lib/i18n.ts",
];
const context = paths
  .filter((p) => fs.existsSync(p))
  .map((p) => {
    let body = fs.readFileSync(p, "utf8");
    if (p === "app/lib/i18n.ts" && body.length > 25000) {
      // Keep login-related keys visible: send full file if under 30k else trim middle
      body = body.slice(0, 12000) + "\n/* …middle omitted… */\n" + body.slice(-8000);
    }
    return "===CURRENT FILE: " + p + "===\n" + body + "\n===END===";
  })
  .join("\n\n");

const system =
  "You are GLM authoring a login UX polish under Model Constitution + luxuryprep-ux-ui. " +
  "thinking disabled. Output ONLY ===FILE: path=== / ===ENDFILE=== full bodies. " +
  "Do not change auth logic. Brand luxuryprep hero-level. End with END_LOGIN_UX.";

const payload = JSON.stringify({
  model: process.env.GLM_MODEL || "GLM-5.2",
  messages: [
    { role: "system", content: system },
    {
      role: "user",
      content:
        brief +
        "\n\n## UX skill\n" +
        skill +
        "\n\n## Current files\n" +
        context,
    },
  ],
  temperature: 0.2,
  max_tokens: 48000,
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
      fs.writeFileSync("briefs/LOGIN_UX_GLM_HTTP.json", data, "utf8");
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
      fs.writeFileSync("briefs/LOGIN_UX_GLM_RAW.txt", text, "utf8");
      console.log("FINISH=" + choice.finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CONTENT_CHARS=" + text.length);
      console.log("HAS_END=" + /END_LOGIN_UX/.test(text));
      const filesA = [...text.matchAll(/^===FILE:\s*(.+?)\s*===$/gm)].map(
        (m) => m[1],
      );
      const filesB = [...text.matchAll(/^===FILE===\s*(.+?)\s*$/gm)].map(
        (m) => m[1],
      );
      const files = filesA.length ? filesA : filesB;
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
