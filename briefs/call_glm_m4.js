// M4 authoring call. Full files, not diffs.
const fs = require("fs");
const https = require("https");

const brief = fs.readFileSync("briefs/M4_AUDITOR.md", "utf8");

const context = [
  "app/types/index.ts",
  "app/lib/supabase.ts",
  "app/lib/closings.ts",
  "app/auditor/page.tsx",
  "app/cashier/page.tsx",
  "supabase/migrations/002_daily_closings.sql",
  "supabase/migrations/004_ai_extraction.sql",
  "FOUNDATION.md",
]
  .filter((p) => fs.existsSync(p))
  .map((p) => {
    let body = fs.readFileSync(p, "utf8");
    // Cashier is large; send only first 80 lines as reference that M4 must not touch it
    if (p === "app/cashier/page.tsx") {
      body = body.split(/\r?\n/).slice(0, 80).join("\n") + "\n/* ... cashier continues; DO NOT MODIFY ... */\n";
    }
    if (p === "FOUNDATION.md") {
      // Only auditor + milestones sections — reduce tokens
      const lines = body.split(/\r?\n/);
      const keep = lines.filter(
        (l) =>
          /auditor|Auditor|M4|Portal 2|gated|اعتماد|approv|reject|audit log|DailyClosing/i.test(
            l,
          ),
      );
      body = keep.join("\n");
    }
    return "===CURRENT FILE: " + p + "===\n" + body + "\n===END===";
  })
  .join("\n\n");

const system =
  "You are GLM authoring milestone M4 under the Model Constitution. " +
  "Output ONLY full file bodies delimited by ===FILE: path=== and ===ENDFILE===. " +
  "No markdown fences. No diffs. No commentary. Every file complete and compiling. " +
  "Do not modify the cashier page. Finish with END_M4.";

const payload = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user", content: brief + "\n\n## Current repository files\n\n" + context },
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
      fs.writeFileSync("briefs/M4_GLM_HTTP.json", data, "utf8");
      console.log("STATUS=" + res.statusCode + "  latency=" + (Date.now() - started) + "ms");
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const choice = parsed.choices[0];
      const text = choice.message.content || "";
      fs.writeFileSync("briefs/M4_GLM_RAW.txt", text, "utf8");
      console.log("FINISH=" + choice.finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CONTENT_CHARS=" + text.length);
      console.log("HAS_END_M4=" + /END_M4/.test(text));
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
