const fs = require('fs');
const https = require('https');

const revision = fs.readFileSync('briefs/M2_REVISION.md', 'utf8');
const types = fs.readFileSync('app/types/index.ts', 'utf8');
const cashier = fs.readFileSync('app/cashier/page.tsx', 'utf8');
const supabaseLib = fs.readFileSync('app/lib/supabase.ts', 'utf8');
const seed = fs.readFileSync('supabase/seed_branches.json', 'utf8');

const system =
  'You are GLM fixing M2. Output ONLY a valid unified diff with diff --git headers. End END_DIFF. Minimal reasoning. Use app/ paths and FOUNDATION FinancialFields only.';

const user = [revision, '\nTYPES:\n', types, '\nCASHIER:\n', cashier, '\nSUPABASE LIB:\n', supabaseLib, '\nSEED:\n', seed].join('');

const body = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ],
  temperature: 0.1,
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
      fs.writeFileSync('briefs/M2_GLM_HTTP_REV.json', data, 'utf8');
      console.log('STATUS=' + res.statusCode);
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 1500));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const msg = parsed.choices[0].message;
      const text = msg.content || '';
      fs.writeFileSync('briefs/M2_GLM_RAW_REV.txt', text, 'utf8');
      console.log('FINISH=' + parsed.choices[0].finish_reason);
      console.log('CONTENT=' + text.length);
      console.log('HAS_DIFF_GIT=' + /^diff --git/m.test(text));
      console.log(text.slice(0, 300));
      console.log('---TAIL---');
      console.log(text.slice(-100));
    });
  }
);
req.on('error', (e) => {
  console.log('ERR=' + e.message);
  process.exit(1);
});
req.write(body);
req.end();
