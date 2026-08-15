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
const brief = fs.readFileSync("briefs/CASHIER_UX_R2.md", "utf8");
const page = fs.readFileSync(
  "briefs/CASHIER_UX_STAGED/app/cashier/page.tsx",
  "utf8",
);
const payload = JSON.stringify({
  model: process.env.GLM_MODEL || "GLM-5.2",
  messages: [
    {
      role: "system",
      content:
        "GLM cashier UX R2. thinking disabled. Fix Critical typo + Major AI badge slate. Output ===FILE: app/cashier/page.tsx=== full body. End END_CASHIER_UX.",
    },
    {
      role: "user",
      content:
        brief +
        "\n\n===CURRENT FILE: app/cashier/page.tsx===\n" +
        page +
        "\n===END===\n",
    },
  ],
  temperature: 0,
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
      fs.writeFileSync("briefs/CASHIER_UX_R2_HTTP.json", data, "utf8");
      console.log("STATUS=" + res.statusCode + " latency=" + (Date.now() - started));
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const text = parsed.choices[0].message.content || "";
      fs.writeFileSync("briefs/CASHIER_UX_R2_RAW.txt", text, "utf8");
      console.log("FINISH=" + parsed.choices[0].finish_reason);
      console.log("HAS_END=" + /END_CASHIER_UX/.test(text));
      const files = [...text.matchAll(/^===FILE:\s*(.+?)\s*===$/gm)].map(
        (m) => m[1],
      );
      const ends = (text.match(/^===ENDFILE===$/gm) || []).length;
      console.log("FILES(" + files.length + "/" + ends + "): " + files.join(", "));
      console.log("CONTENT_CHARS=" + text.length);
    });
  },
);
req.on("error", (e) => {
  console.log("ERR=" + e.message);
  process.exit(1);
});
req.write(payload);
req.end();
