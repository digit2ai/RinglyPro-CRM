// Pins the Sec-MS-GEC v2 port (src/services/edge-tts-gec.js) to vectors produced by the
// Python reference (rany2/edge-tts drm.py, generate_sec_ms_gec_v2). Offline, no keys.
// A wrong token is a 403 from Microsoft and every voice in the repo goes silent.
const { generateSecMsGecV2: g } = require('../src/services/edge-tts-gec');
const fs = require('fs'); const path = require('path');
const V = {
  1700000000: '2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2',
  1760000000: '6D50DDDB91812C33-DD68EFB01898B0750C9797D51A5FF93471DFDAE6888A1039D532CBDCCE54545D',
  1790000123.5: '25DE39E082B2F802-135E7D0D6846115501860D25B87529E42A501FCA6D01B105B0584682863C784C',
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
for (const [t, v] of Object.entries(V)) ok(g(Number(t)) === v, 'vector ' + t);
ok(g(1760000000) === g(1760000000 + 299 - (1760000000 + 11644473600) % 300), 'same 5-minute window, same token');
for (const f of ['src/services/edge-tts.js', 'verticals/torna_idioma/backend/services/edge-tts.js']) {
  const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  ok(/'2-\d+\.\d+\.\d+\.\d+'/.test(s) && /generateSecMsGecV2\(\)/.test(s) && /muid=/.test(s) && !/function generateSecMsGec\(/.test(s), f + ' uses the v2 token, version 2- and a MUID cookie');
}
console.log(`EDGE TTS GEC: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
