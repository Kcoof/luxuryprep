// M6 authoring — login gateway
const fs = require("fs");
const https = require("https");

const brief = fs.readFileSync("briefs/M6_LOGIN.md", "utf8");

const context = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/lib/supabase.ts",
  "app/types/index.ts",
  "app/cashier/page.tsx",
  "app/auditor/page.tsx",
  ".env.local.example",
]
  .filter((p) => fs.existsSync(p))
  .map((p) => {
    const body = fs.readFileSync(p, "utf8");
    return "===CURRENT FILE: " + p + "===\n" + body + "\n===END===";
  })
  .join("\n\n");

const system =
  "You are GLM authoring milestone M6 under the Model Constitution. " +
  "Output ONLY full file bodies delimited by ===FILE: path=== and ===ENDFILE===. " +
  "No markdown fences. No diffs. No commentary. No Firebase. Brand luxuryprep. " +
  "Finish with END_M6.";

const payload = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: "system", content: system },
    {
      role: "user",
      content:
        brief +
        "\n\n## Current repository files\n\n" +
        context +
        "\n\nCashier branch localStorage key is exactly: cashier_selected_branch\n" +
        "Shape: JSON { id, name } (Branch). On cashier login write this key too.\n",
    },
  ],
  temperature: 0.1,
  max_tokens: 64000,
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
      fs.writeFileSync("briefs/M6_GLM_HTTP.json", data, "utf8");
      console.log("STATUS=" + res.statusCode + "  latency=" + (Date.now() - started) + "ms");
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const choice = parsed.choices[0];
      const text = choice.message.content || "";
      fs.writeFileSync("briefs/M6_GLM_RAW.txt", text, "utf8");
      console.log("FINISH=" + choice.finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CONTENT_CHARS=" + text.length);
      console.log("HAS_END_M6=" + /END_M6/.test(text));
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
