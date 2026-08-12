// M3 pre-flight, stage 2: can the vision model extract the actual closing
// fields from an Arabic RTL Z-report, not merely accept an image?
// Usage: node briefs/probe_glm_ocr.js <path-to-image> [model]
const fs = require("fs");
const path = require("path");

const imgPath = process.argv[2];
const model = process.argv[3] || "glm-4.6v";
const base = process.env.GLM_BASE_URL.replace(/\/$/, "");

const EXPECTED = {
  branchCode: "B02",
  businessDate: "2026-08-12",
  grossSales: 12450.75,
  netSales: 10826.74,
  vat: 1624.01,
  cashSystem: 4300,
  spanSystem: 5126.74,
  deliveryAppsSystem: 1400,
  reversedTransactions: 85.5,
  invoiceCount: 214,
  cashActualHanded: 4275,
};

const SCHEMA = `{
  "branchCode": string|null, "businessDate": "YYYY-MM-DD"|null,
  "grossSales": number|null, "netSales": number|null, "vat": number|null,
  "cashSystem": number|null, "spanSystem": number|null,
  "deliveryAppsSystem": number|null, "reversedTransactions": number|null,
  "invoiceCount": number|null, "cashActualHanded": number|null
}`;

const ext = path.extname(imgPath).slice(1).toLowerCase() || "png";
const dataUrl =
  "data:image/" + (ext === "jpg" ? "jpeg" : ext) + ";base64," +
  fs.readFileSync(imgPath).toString("base64");

// GLM vision models reason before answering and will spend the entire
// max_tokens budget on it, returning empty content. Disable thinking.
const body = {
  model,
  temperature: 0,
  max_tokens: 2048,
  thinking: { type: "disabled" },
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "This is an Arabic (RTL) point-of-sale daily closing Z-report.\n" +
            "Extract the fields into JSON matching exactly this schema:\n" + SCHEMA + "\n" +
            "Rules: strip thousands separators; use a dot decimal; null for anything absent; " +
            "return ONLY raw JSON with no markdown fence and no commentary.",
        },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ],
};

(async () => {
  console.log("model=" + model + "  image=" + path.basename(imgPath) +
              "  bytes=" + fs.statSync(imgPath).size);
  const started = Date.now();
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.GLM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log("status=" + r.status + "  latency=" + (Date.now() - started) + "ms");
  if (!r.ok) return console.log(text.slice(0, 500));

  const parsed = JSON.parse(text);
  const usage = parsed.usage || {};
  console.log("tokens: prompt=" + usage.prompt_tokens + " completion=" + usage.completion_tokens +
              "  finish=" + parsed.choices?.[0]?.finish_reason);

  const raw = (parsed.choices?.[0]?.message?.content ?? "").trim();
  const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let got;
  try {
    got = JSON.parse(json);
  } catch {
    console.log("\nMODEL DID NOT RETURN PARSEABLE JSON:\n" + raw.slice(0, 800));
    return;
  }

  console.log("\nfield                  expected        got             ok");
  let pass = 0;
  const keys = Object.keys(EXPECTED);
  for (const k of keys) {
    const exp = EXPECTED[k];
    const val = got[k];
    const ok = typeof exp === "number" ? Math.abs(Number(val) - exp) < 0.01 : String(val) === exp;
    if (ok) pass++;
    console.log(
      k.padEnd(22) + String(exp).padEnd(16) + String(val).padEnd(16) + (ok ? "OK" : "MISMATCH"),
    );
  }
  const extra = Object.keys(got).filter((k) => !(k in EXPECTED));
  if (extra.length) console.log("\nunexpected extra keys: " + extra.join(", "));
  console.log("\nACCURACY " + pass + "/" + keys.length);
})();
