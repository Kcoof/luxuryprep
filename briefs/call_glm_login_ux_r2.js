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
const brief = fs.readFileSync("briefs/LOGIN_UX_R2.md", "utf8");
const context =
  "===CURRENT FILE: app/login-form.tsx===\n" +
  fs.readFileSync("briefs/LOGIN_UX_STAGED/app/login-form.tsx", "utf8") +
  "\n===END===\n\n===CURRENT FILE: app/lib/i18n.ts===\n" +
  fs.readFileSync("briefs/LOGIN_UX_STAGED/app/lib/i18n.ts", "utf8") +
  "\n===END===\n";
const payload = JSON.stringify({
  model: process.env.GLM_MODEL || "GLM-5.2",
  messages: [
    {
      role: "system",
      content:
        "GLM R2 login UX. thinking disabled. Output ===FILE: path=== / ===ENDFILE=== only. End END_LOGIN_UX.",
    },
    { role: "user", content: brief + "\n" + context },
  ],
  temperature: 0,
  max_tokens: 48000,
  thinking: { type: "disabled" },
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
      fs.writeFileSync("briefs/LOGIN_UX_R2_HTTP.json", data, "utf8");
      console.log("STATUS=" + res.statusCode + " latency=" + (Date.now() - started));
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const text = parsed.choices[0].message.content || "";
      fs.writeFileSync("briefs/LOGIN_UX_R2_RAW.txt", text, "utf8");
      console.log("FINISH=" + parsed.choices[0].finish_reason);
      console.log("HAS_END=" + /END_LOGIN_UX/.test(text));
      const files = [...text.matchAll(/^===FILE:\s*(.+?)\s*===$/gm)].map((m) => m[1]);
      console.log("FILES=" + files.join(", "));
    });
  },
);
req.on("error", (e) => {
  console.log("ERR=" + e.message);
  process.exit(1);
});
req.write(payload);
req.end();
