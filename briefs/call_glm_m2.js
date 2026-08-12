const fs = require('fs');
const https = require('https');

const brief = fs.readFileSync('briefs/M2_CASHIER.md', 'utf8');
const foundation = fs.readFileSync('FOUNDATION.md', 'utf8');
const cashier = fs.readFileSync('app/cashier/page.tsx', 'utf8');
const types = fs.readFileSync('app/types/index.ts', 'utf8');
const supabaseLib = fs.readFileSync('app/lib/supabase.ts', 'utf8');

const system = [
  'You are GLM, sole implementation author under Model Constitution.',
  'Return ONLY a unified diff (git apply -p1 from repo root) for M2.',
  'No markdown fences. End with END_DIFF.',
  'Hunk counts must be exact. Prefer modifying existing files with context hunks.',
  'Do not touch .gitignore as a new file. No secrets. No Gemini. No M3 analyze API.',
].join('\n');

const user = [
  brief,
  '\n\nFOUNDATION excerpt responsibilities already locked.\n',
  '\nCURRENT app/cashier/page.tsx:\n',
  cashier,
  '\nCURRENT app/types/index.ts:\n',
  types,
  '\nCURRENT app/lib/supabase.ts:\n',
  supabaseLib,
].join('');

const body = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ],
  temperature: 0.2,
  max_tokens: 16000,
});

const url = new URL(process.env.GLM_BASE_URL.replace(/\/$/, '') + '/chat/completions');
const req = https.request(
  {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.GLM_API_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      fs.writeFileSync('briefs/M2_GLM_HTTP.json', data, 'utf8');
      console.log('STATUS=' + res.statusCode);
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 2000));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const text =
        (parsed.choices &&
          parsed.choices[0] &&
          parsed.choices[0].message &&
          parsed.choices[0].message.content) ||
        '';
      fs.writeFileSync('briefs/M2_GLM_RAW.txt', text, 'utf8');
      console.log('CHARS=' + text.length);
      console.log(text.slice(0, 350));
      console.log('---TAIL---');
      console.log(text.slice(-120));
    });
  }
);
req.on('error', (e) => {
  console.log('ERR=' + e.message);
  process.exit(1);
});
req.write(body);
req.end();
