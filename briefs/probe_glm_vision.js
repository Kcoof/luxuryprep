// M3 pre-flight: does the configured GLM endpoint accept image input at all?
// Builds a solid-red PNG in memory and asks the model to name its colour, so a
// wrong answer is distinguishable from an outright rejection of image parts.
const zlib = require("zlib");

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function redPng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  const raw = Buffer.concat(
    Array.from({ length: size }, () =>
      Buffer.concat([
        Buffer.from([0]), // filter: none
        Buffer.concat(Array.from({ length: size }, () => Buffer.from([255, 0, 0]))),
      ]),
    ),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const base = process.env.GLM_BASE_URL.replace(/\/$/, "");
const key = process.env.GLM_API_KEY;
const headers = { Authorization: "Bearer " + key, "Content-Type": "application/json" };

async function listModels() {
  try {
    const r = await fetch(base + "/models", { headers });
    const t = await r.text();
    console.log("MODELS STATUS=" + r.status);
    console.log(t.slice(0, 1200));
  } catch (e) {
    console.log("MODELS ERROR " + e.message);
  }
}

async function tryVision(model, dataUrl) {
  const body = {
    model,
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What colour is this image? Reply with one word." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  };
  try {
    const r = await fetch(base + "/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const t = await r.text();
    let answer = "";
    try {
      answer = JSON.parse(t).choices?.[0]?.message?.content ?? "";
    } catch {}
    console.log(
      "  " + model.padEnd(14) + " status=" + r.status +
      (answer ? "  answer=" + JSON.stringify(answer.trim().slice(0, 60))
              : "  body=" + t.replace(/\s+/g, " ").slice(0, 220)),
    );
  } catch (e) {
    console.log("  " + model.padEnd(14) + " ERROR " + e.message);
  }
}

(async () => {
  console.log("BASE=" + base);
  console.log("CONFIGURED_MODEL=" + process.env.GLM_MODEL);
  console.log("KEY_PRESENT=" + Boolean(key));
  console.log("\n=== available models ===");
  await listModels();

  const dataUrl = "data:image/png;base64," + redPng(16).toString("base64");
  console.log("\n=== vision probe (expect: red) ===");
  const candidates = [process.env.GLM_MODEL, "glm-4.6v", "glm-4.5v", "glm-4v", "glm-4v-flash"];
  for (const m of [...new Set(candidates.filter(Boolean))]) await tryVision(m, dataUrl);
})();
