const fs = require('fs');
const https = require('https');

const brief = fs.readFileSync('briefs/M1_SKELETON.md', 'utf8');
const revision = fs.readFileSync('briefs/M1_REVISION_R2.md', 'utf8');
const prior = fs.readFileSync('briefs/M1_GLM_RAW.txt', 'utf8');

const system = [
  'You are GLM revising your own M1 artifact under Model Constitution.',
  'Return ONLY a corrected unified diff (patch -p1 from repo root).',
  'No markdown fences. No commentary before the diff. End with END_DIFF.',
  'Fix all blocking review findings. Do not include secrets.',
].join('\n');

const user = [
  revision,
  '\n\nPRIOR DIFF (replace entirely with corrected version):\n',
  prior,
  '\n\nORIGINAL BRIEF:\n',
  brief,
].join('');

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
      fs.writeFileSync('briefs/M1_GLM_HTTP_R2.json', data, 'utf8');
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
      fs.writeFileSync('briefs/M1_GLM_RAW_R2.txt', text, 'utf8');
      console.log('CHARS=' + text.length);
      console.log(text.slice(0, 300));
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
