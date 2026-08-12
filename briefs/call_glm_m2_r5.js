const fs = require('fs');
const https = require('https');

const revision = fs.readFileSync('briefs/M2_REVISION_R5.md', 'utf8');
let prior = fs.readFileSync('briefs/M2_GLM_RAW_R4.txt', 'utf8');
prior = prior.replace(/^```(?:diff)?\r?\n/, '').replace(/\r?\n```\s*$/, '');

const system =
  'You are GLM. Output ONLY a raw unified diff. No fences. Exact @@ +counts. END_DIFF. Fix R5 Majors; keep prior M2 behavior.';

const user = revision + '\n\nPRIOR R4 DIFF TO REPLACE ENTIRELY:\n' + prior;

const body = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ],
  temperature: 0.05,
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
      fs.writeFileSync('briefs/M2_GLM_HTTP_R5.json', data, 'utf8');
      console.log('STATUS=' + res.statusCode);
      if (res.statusCode !== 200) {
        console.log(data.slice(0, 2000));
        process.exit(1);
      }
      const parsed = JSON.parse(data);
      const msg = parsed.choices[0].message;
      const text = msg.content || '';
      fs.writeFileSync('briefs/M2_GLM_RAW_R5.txt', text, 'utf8');
      console.log('FINISH=' + parsed.choices[0].finish_reason);
      console.log('CONTENT=' + text.length);
      console.log('HAS_DIFF_GIT=' + /^diff --git/m.test(text));
      // recount
      const parts = text.replace(/\r?\nEND_DIFF\s*$/, '').split(/^diff --git /m).filter(Boolean);
      for (const p of parts) {
        const name = p.split(/\n/)[0].trim();
        const m = p.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        const bodyLines = p.split(/^@@.*$/m).slice(1).join('\n').split(/\n/);
        let plus = 0,
          minus = 0;
        for (const line of bodyLines) {
          if (line.startsWith('+') && !line.startsWith('+++')) plus++;
          else if (line.startsWith('-') && !line.startsWith('---')) minus++;
        }
        const declared = m ? Number(m[4] || 1) : null;
        console.log(name, 'declared+', declared, 'actual+', plus, declared === plus ? 'OK' : 'MISMATCH');
      }
      console.log(text.slice(0, 200));
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
