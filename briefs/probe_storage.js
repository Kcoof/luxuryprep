// Definitive check that the closing-images bucket exists AND that its RLS
// policies permit what the cashier flow actually does. Listing buckets with an
// anon key returns empty even when they exist, so this performs a real upload.
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
const crc32 = (b) => {
  let c = -1;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const b = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(b));
  return Buffer.concat([len, b, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(4, 0);
ihdr.writeUInt32BE(4, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = Buffer.concat(
  Array.from({ length: 4 }, () =>
    Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, 128, 0])))]),
  ),
);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const auth = { apikey: key, Authorization: "Bearer " + key };
const objectPath = "B01/z-report/selftest-" + Date.now() + ".png";

(async () => {
  let r = await fetch(base + "/storage/v1/object/closing-images/" + objectPath, {
    method: "POST",
    headers: { ...auth, "Content-Type": "image/png" },
    body: png,
  });
  const uploadBody = await r.text();
  console.log("UPLOAD status=" + r.status + "  " + uploadBody.slice(0, 200));

  if (r.status >= 300) {
    console.log("\nVERDICT: bucket missing or insert policy blocking.");
    return;
  }

  r = await fetch(base + "/storage/v1/object/sign/closing-images/" + objectPath, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  const signBody = await r.text();
  console.log("SIGN   status=" + r.status + "  " + signBody.slice(0, 160));

  r = await fetch(base + "/storage/v1/object/public/closing-images/" + objectPath);
  console.log("PUBLIC status=" + r.status + "  (400/404 expected — bucket is private)");

  console.log("\nVERDICT: bucket exists and upload works.");
  console.log("test object left at: " + objectPath);
})();
