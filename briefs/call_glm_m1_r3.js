const fs = require('fs');
const https = require('https');

const revision = fs.readFileSync('briefs/M1_REVISION_R3.md', 'utf8');
const prior = fs.readFileSync('briefs/M1_GLM_RAW_R2.txt', 'utf8');

const system = [
  'You are GLM revising M1 under Model Constitution (round 3/3).',
  'Return ONLY a unified diff. No markdown fences. End with END_DIFF.',
  'Remove the .gitignore hunk completely. Keep all other files from the prior diff.',
  'Do not invent new features. Do not include secrets.',
].join('\n');

const user = revision + '\n\nPRIOR R2 DIFF:\n' + prior;

const body = JSON.stringify({
  model: process.env.GLM_MODEL,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ],
  temperature: 0.1,
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
      fs.writeFileSync('briefs/M1_GLM_HTTP_R3.json', data, 'utf8');
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
      fs.writeFileSync('briefs/M1_GLM_RAW_R3.txt', text, 'utf8');
      console.log('CHARS=' + text.length);
      console.log('HAS_GITIGNORE_HUNK=' + /diff --git a\/\.gitignore/.test(text));
      console.log(text.slice(0, 200));
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
