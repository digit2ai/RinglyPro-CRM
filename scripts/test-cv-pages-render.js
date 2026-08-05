#!/usr/bin/env node
// Render check for the self-rendering CV pages.
//
// These pages build themselves from a PROFILE object at runtime, so ONE null reference takes
// the whole page down — which is exactly what happened when the QR modal was emitted after
// the <script> that wired its handlers: the page shipped as a name on an empty background.
// A syntax check cannot catch that. This actually EXECUTES the page in a DOM and asserts the
// content landed.
//
//   node scripts/test-cv-pages-render.js [--url https://samuelpacelli.com]
//
// With no --url it checks the local files; with --url it checks what production is serving.

const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.log('jsdom is not installed — install it to run this check:\n  npm install jsdom --no-save');
  process.exit(0);
}

const PAGES = [
  { file: 'public/samuelpacelli.html', name: 'samuelpacelli',
    expect: { text: ['Samuel Pacelli', 'Pro City Supply', 'Sanwa Food Group', 'Teleperformance', 'MATEC',
                     'NetSuite', 'Yacambú', 'incomplete'],
              filled: ['titleLine', 'subtitle', 'chips', 'socialRow', 'content', 'shareHint', 'shareLbl', 'vcfLbl', 'qrLbl'],
              sections: 5 } }
];

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name + (detail ? ' -> ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' -> ' + detail : '')); }
}

async function loadHtml(page, urlBase) {
  if (urlBase) {
    const res = await fetch(urlBase);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  }
  return fs.readFileSync(path.join(__dirname, '..', page.file), 'utf8');
}

(async () => {
  const urlArg = process.argv.indexOf('--url');
  const urlBase = urlArg > -1 ? process.argv[urlArg + 1] : null;
  console.log('CV page render check' + (urlBase ? ' (live: ' + urlBase + ')' : ' (local files)') + '\n' + '='.repeat(52));

  for (const page of PAGES) {
    console.log('\n== ' + page.name + ' ==');
    const html = await loadHtml(page, urlBase);
    const errors = [];
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      url: 'https://' + page.name + '.com/',
      beforeParse(win) {
        // The page beacons page views and may fetch audio; neither should fail the check.
        win.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new win.Blob()) });
        win.scrollTo = () => {};
        win.HTMLElement.prototype.scrollIntoView = () => {};
        win.addEventListener('error', (e) => errors.push(e.error ? (e.error.message || String(e.error)) : e.message));
      }
    });
    await new Promise((r) => setTimeout(r, 400));
    const doc = dom.window.document;

    // The headline symptom: a script that dies leaves every JS-filled element empty.
    ok('page script ran without throwing', errors.length === 0, errors.join(' | '));

    page.expect.filled.forEach((id) => {
      const el = doc.getElementById(id);
      const filled = !!el && (el.textContent || '').trim().length > 0;
      ok('#' + id + ' is populated', filled, el ? 'empty' : 'element missing');
    });

    const body = doc.body.textContent.replace(/\s+/g, ' ');
    page.expect.text.forEach((t) => ok('renders "' + t + '"', body.indexOf(t) >= 0));

    const sections = doc.querySelectorAll('#content .blk');
    ok('all ' + page.expect.sections + ' sections rendered', sections.length === page.expect.sections, sections.length + ' found');

    // Elements the wiring depends on must exist BEFORE the script that binds them.
    const idx = (needle) => html.indexOf(needle);
    ok('QR modal is in the DOM before the script that wires it',
      idx('id="qrModal"') > -1 && idx('id="qrModal"') < idx('\n<script>'),
      'modal at ' + idx('id="qrModal"') + ', script at ' + idx('\n<script>'));

    // The contact download must not use a data: URL — iOS Safari ignores those silently.
    ok('Save contact points at a real .vcf file, not a data: URL',
      /href="\/[a-z]+\.vcf"/.test(html) && !/data:text\/vcard/.test(html));

    dom.window.close();
  }

  console.log('\n' + '='.repeat(52));
  console.log('RESULT: ' + pass + '/' + (pass + fail) + ' passed');
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('render check crashed:', e.message); process.exit(1); });
