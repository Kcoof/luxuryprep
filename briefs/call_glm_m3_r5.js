// M3 round 5 (narrow). Resolves the Claude/Codex split: block save while
// parseErrors is non-empty. Baseline is round-4 output.
const fs = require("fs");
const https = require("https");

const revision = fs.readFileSync("briefs/M3_REVISION_R5.md", "utf8");
const priorR4 = fs.readFileSync("briefs/M3_GLM_RAW_R4.txt", "utf8");

const context = [
  "supabase/migrations/002_daily_closings.sql",
  "supabase/migrations/003_storage_closing_images.sql",
  "app/types/index.ts",
  "app/lib/supabase.ts",
]
  .map((p) => "===CURRENT FILE: " + p + "===\n" + fs.readFileSync(p, "utf8") + "\n===END===")
  .join("\n\n");

const system =
  "You are GLM revising milestone M3 under the Model Constitution, round 5 " +
  "(narrow, user-authorized to resolve a split verdict). " +
  "Round 4 is accepted except for one Major: save must be blocked while " +
  "parseErrors is non-empty. Change ONLY what the brief requires. " +
  "Output ONLY full file bodies delimited by ===FILE: path=== and ===ENDFILE===. " +
  "No markdown fences anywhere, including after END_M3. No diffs. No commentary. " +
  "Every file complete and compiling. Finish with END_M3.";

const user =
  revision +
  "\n\n## Reference: existing project files you must align with\n\n" + context +
  "\n\n## YOUR ROUND-4 OUTPUT (accepted baseline - revise only per the brief)\n\n" + priorR4;

const payload = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user", content: user },
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
      fs.writeFileSync("briefs/M3_GLM_HTTP_R5.json", data, "utf8");
      console.log("STATUS=" + res.statusCode + "  latency=" + (Date.now() - started) + "ms");
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const choice = parsed.choices[0];
      const text = choice.message.content || "";
      fs.writeFileSync("briefs/M3_GLM_RAW_R5.txt", text, "utf8");

      console.log("FINISH=" + choice.finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CONTENT_CHARS=" + text.length);
      console.log("HAS_END_M3=" + /END_M3/.test(text));
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
