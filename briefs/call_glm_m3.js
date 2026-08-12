// M3 authoring call. Sends the brief plus the current contents of every file
// GLM is allowed to rewrite, and asks for full files rather than a diff —
// malformed hunk counts cost four rounds across M1/M2.
const fs = require("fs");

const brief = fs.readFileSync("briefs/M3_ANALYZE.md", "utf8");

const context = [
  "app/types/index.ts",
  "app/lib/supabase.ts",
  "app/cashier/page.tsx",
  "supabase/migrations/002_daily_closings.sql",
]
  .map((p) => "===CURRENT FILE: " + p + "===\n" + fs.readFileSync(p, "utf8") + "\n===END===")
  .join("\n\n");

const system =
  "You are GLM authoring milestone M3 under the Model Constitution. " +
  "Output ONLY full file bodies delimited by ===FILE: path=== and ===ENDFILE===. " +
  "No markdown fences. No diffs. No commentary before or after. " +
  "Every file you emit must be complete and compile. Finish with END_M3.";

const body = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user", content: brief + "\n\n## Current repository files\n\n" + context },
  ],
  temperature: 0.1,
  max_tokens: 64000,
});

(async () => {
  const url = process.env.GLM_BASE_URL.replace(/\/$/, "") + "/chat/completions";
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.GLM_API_KEY,
      "Content-Type": "application/json",
    },
    body,
  });
  const data = await res.text();
  fs.writeFileSync("briefs/M3_GLM_HTTP.json", data, "utf8");
  console.log("STATUS=" + res.status + "  latency=" + (Date.now() - started) + "ms");
  if (!res.ok) return console.log(data.slice(0, 1500));

  const parsed = JSON.parse(data);
  const choice = parsed.choices[0];
  const text = choice.message.content || "";
  fs.writeFileSync("briefs/M3_GLM_RAW.txt", text, "utf8");

  console.log("FINISH=" + choice.finish_reason);
  console.log("USAGE=" + JSON.stringify(parsed.usage));
  console.log("CONTENT_CHARS=" + text.length);
  console.log("HAS_FENCE=" + /```/.test(text));
  console.log("ENDS_WITH_END_M3=" + /END_M3\s*$/.test(text));
  const files = [...text.matchAll(/^===FILE:\s*(.+?)\s*===$/gm)].map((m) => m[1]);
  const ends = (text.match(/^===ENDFILE===$/gm) || []).length;
  console.log("FILES(" + files.length + "/" + ends + " closed): " + files.join(", "));
})();
