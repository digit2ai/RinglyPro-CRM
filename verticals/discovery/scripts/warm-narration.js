'use strict';

/**
 * WARM THE NARRATION CACHE.
 *
 * /api/tts/edge caches synthesized MP3s on disk, keyed by a hash of the text,
 * voice and rate. Render's disk is ephemeral, so every redeploy empties it and
 * the NEXT VISITOR pays the cold-connect cost on every segment — which is the
 * eight-to-fifteen seconds that made the voice look broken in the first place.
 *
 * Run this after a deploy. It reads the segments straight out of guide.js, so
 * it cannot drift from what the page actually asks for: edit the script and
 * this warms the new wording without being touched.
 *
 * Usage:  node verticals/discovery/scripts/warm-narration.js [baseUrl]
 */

const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'https://orbup.app').replace(/\/+$/, '');
const GUIDE = path.join(__dirname, '..', 'public', 'guide.js');
const VOICE = { en: 'ava', es: 'dalia' };

function segments() {
  const js = fs.readFileSync(GUIDE, 'utf8');
  const m = js.match(/const SCRIPT = ({[\s\S]*?\n});/);
  if (!m) throw new Error('Could not find the SCRIPT block in guide.js');
  // eslint-disable-next-line no-eval
  return eval('(' + m[1] + ')');
}

async function main() {
  const SCRIPT = segments();
  const langs = Object.keys(SCRIPT);
  let ok = 0, failed = 0, hits = 0;

  console.log(`Warming narration on ${BASE}\n${'='.repeat(58)}`);

  for (const lang of langs) {
    for (let i = 0; i < SCRIPT[lang].length; i++) {
      const t0 = Date.now();
      try {
        const res = await fetch(BASE + '/api/tts/edge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: SCRIPT[lang][i], voice: VOICE[lang] || 'ava' })
        });
        const buf = Buffer.from(await res.arrayBuffer());
        const cache = res.headers.get('x-cache') || '';
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        if (res.ok && buf.length > 1000) {
          ok++; if (cache === 'HIT') hits++;
          console.log(`  ${lang} ${String(i).padStart(2)}  ${String(SCRIPT[lang][i].length).padStart(5)} chars  ${String(buf.length).padStart(7)} bytes  ${secs.padStart(5)}s  ${cache}`);
        } else {
          failed++;
          console.log(`  ${lang} ${String(i).padStart(2)}  FAILED  HTTP ${res.status}  ${secs}s`);
        }
      } catch (e) {
        failed++;
        console.log(`  ${lang} ${String(i).padStart(2)}  FAILED  ${e.message}`);
      }
    }
  }

  console.log('='.repeat(58));
  console.log(`${ok} warmed (${hits} already cached), ${failed} failed.`);
  if (failed) {
    console.log('A failure here means the next listener falls back to the browser voice for that segment.');
    process.exit(1);
  }
  console.log('Every segment is now a cache hit. The next listener waits on nothing.');
}

main().catch(e => { console.error(e); process.exit(1); });
