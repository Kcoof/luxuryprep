const fs = require('fs');
const https = require('https');

function loadSec() {
  // env already injected by caller
}

const revision = fs.readFileSync('briefs/M2_REVISION_R2.md', 'utf8');
const types = fs.readFileSync('app/types/index.ts', 'utf8');
const cashier = fs.readFileSync('app/cashier/page.tsx', 'utf8');
const supabaseLib = fs.readFileSync('app/lib/supabase.ts', 'utf8');
const seed = fs.readFileSync('supabase/seed_branches.json', 'utf8');
const sql001 = fs.readFileSync('supabase/migrations/001_branches.sql', 'utf8');

const system = [
  'You are GLM under Model Constitution.',
  'Output ONLY a valid unified diff. Minimal reasoning.',
  'diff --git headers required. Exact hunk counts. END_DIFF at end.',
  'Use app/ paths and FOUNDATION FinancialFields only.',
].join('\n');

const user = [
  revision,
  '\n\n=== app/types/index.ts ===\n',
  types,
  '\n\n=== app/cashier/page.tsx ===\n',
  cashier,
  '\n\n=== app/lib/supabase.ts ===\n',
  supabaseLib,
  '\n\n=== seed_branches.json ===\n',
  seed,
  '\n\n=== 001_branches.sql (policy pattern) ===\n',
  sql001,
].join('');

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
      fs.writeFileSync('briefs/M2_GLM_HTTP_R3.json', data, 'utf8');
      console.log('STATUS=' + res.statusCode);
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 2000));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const msg = parsed.choices[0].message;
      const text = msg.content || '';
      fs.writeFileSync('briefs/M2_GLM_RAW_R3.txt', text, 'utf8');
      console.log('FINISH=' + parsed.choices[0].finish_reason);
      console.log('CONTENT=' + text.length);
      console.log('REASON=' + ((msg.reasoning_content || '').length));
      console.log('HAS_DIFF_GIT=' + /^diff --git/m.test(text));
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
