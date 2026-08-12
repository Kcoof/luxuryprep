const fs = require('fs');
const https = require('https');

const brief = fs.readFileSync('briefs/M1_SKELETON.md', 'utf8');
const foundation = fs.readFileSync('FOUNDATION.md', 'utf8');

const system = [
  'You are GLM, sole implementation author under Model Constitution.',
  'Return ONLY a single unified diff (git apply / patch -p1 compatible from repo root) that creates the M1 skeleton described in the brief.',
  'Rules:',
  '- No markdown fences.',
  '- No commentary before the diff.',
  '- End with a line containing only: END_DIFF',
  '- Do not include secrets, .sec, or .env.local',
  '- Do not implement Gemini or full M2-M5 features',
  '- Include package.json, Next 14 configs, app layout RTL, types, supabase client, utils, cashier and auditor shell pages, globals.css design tokens',
].join('\n');

const user = 'IMPLEMENTATION BRIEF:\n' + brief + '\n\nFOUNDATION:\n' + foundation;

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
      fs.writeFileSync('briefs/M1_GLM_HTTP.json', data, 'utf8');
      console.log('STATUS=' + res.statusCode);
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 2000));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const text = (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) || '';
      fs.writeFileSync('briefs/M1_GLM_RAW.txt', text, 'utf8');
      console.log('CHARS=' + text.length);
      console.log(text.slice(0, 400));
      console.log('---TAIL---');
      console.log(text.slice(-200));
    });
  }
);

req.on('error', (e) => {
  console.log('ERR=' + e.message);
  process.exit(1);
});
req.write(body);
req.end();
