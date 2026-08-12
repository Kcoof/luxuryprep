const fs = require('fs');
const https = require('https');

const brief = fs.readFileSync('briefs/M2_CASHIER.md', 'utf8');
const seed = fs.readFileSync('supabase/seed_branches.json', 'utf8');

const system = [
  'You are GLM under Model Constitution. Output a unified diff FIRST. Keep reasoning minimal.',
  'Return ONLY the diff ending with END_DIFF. No markdown fences.',
  'Exact hunk counts. Modify app/cashier/page.tsx; add small helper files if needed.',
  'USE existing branch ids B01-B21 from seed_branches.json — never invent fake branch ids.',
  'No Gemini. No analyze API. No secrets. Do not recreate .gitignore.',
].join('\n');

const user = [
  brief,
  '\n\nEXISTING supabase/seed_branches.json (use as-is / import; do not replace with fake data):\n',
  seed,
  '\n\nDeliver compact client cashier wizard + helpers + optional 002_daily_closings.sql.',
].join('');

const body = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ],
  temperature: 0.2,
  max_tokens: 32000,
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
      fs.writeFileSync('briefs/M2_GLM_HTTP_R2.json', data, 'utf8');
      console.log('STATUS=' + res.statusCode);
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 2000));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const msg = parsed.choices && parsed.choices[0] && parsed.choices[0].message;
      const text = (msg && msg.content) || '';
      fs.writeFileSync('briefs/M2_GLM_RAW.txt', text, 'utf8');
      console.log('FINISH=' + (parsed.choices && parsed.choices[0] && parsed.choices[0].finish_reason));
      console.log('CONTENT_CHARS=' + text.length);
      console.log('REASON_CHARS=' + ((msg && msg.reasoning_content) || '').length);
      console.log(text.slice(0, 400));
      console.log('---TAIL---');
      console.log(text.slice(-150));
    });
  }
);
req.on('error', (e) => {
  console.log('ERR=' + e.message);
  process.exit(1);
});
req.write(body);
req.end();
