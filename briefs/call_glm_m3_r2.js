// M3 round 2. Sends the revision brief plus GLM's own R1 output (the artifact
// the reviewers actually judged) and the migrations it must align with.
const fs = require("fs");

const revision = fs.readFileSync("briefs/M3_REVISION_R2.md", "utf8");
const priorR1 = fs.readFileSync("briefs/M3_GLM_RAW.txt", "utf8");

const context = [
  "supabase/migrations/002_daily_closings.sql",
  "supabase/migrations/003_storage_closing_images.sql",
  "app/types/index.ts",
  "app/lib/supabase.ts",
]
  .map((p) => "===CURRENT FILE: " + p + "===\n" + fs.readFileSync(p, "utf8") + "\n===END===")
  .join("\n\n");

const system =
  "You are GLM revising milestone M3 under the Model Constitution, round 2 of 3. " +
  "Both reviewers returned Request changes / Critical. " +
  "Output ONLY full file bodies delimited by ===FILE: path=== and ===ENDFILE===. " +
  "No markdown fences. No diffs. No commentary. Every file complete and compiling. " +
  "Fix every Critical and Major. Do not regress anything listed as already correct. " +
  "Finish with END_M3.";

const user =
  revision +
  "\n\n## Reference: existing project files you must align with\n\n" + context +
  "\n\n## YOUR ROUND-1 OUTPUT (this is what the reviewers judged — revise it)\n\n" + priorR1;

// node:https rather than fetch — undici enforces a 5 minute headers timeout
// (UND_ERR_HEADERS_TIMEOUT) and this prompt reasons for longer than that.
const https = require("https");

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
      fs.writeFileSync("briefs/M3_GLM_HTTP_R2.json", data, "utf8");
      console.log("STATUS=" + res.statusCode + "  latency=" + (Date.now() - started) + "ms");
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const choice = parsed.choices[0];
      const text = choice.message.content || "";
      fs.writeFileSync("briefs/M3_GLM_RAW_R2.txt", text, "utf8");

      console.log("FINISH=" + choice.finish_reason);
      console.log("USAGE=" + JSON.stringify(parsed.usage));
      console.log("CONTENT_CHARS=" + text.length);
      console.log("ENDS_WITH_END_M3=" + /END_M3\s*$/.test(text));
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
