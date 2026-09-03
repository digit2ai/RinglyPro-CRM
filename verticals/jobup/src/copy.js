/* ─────────────────────────────────────────────────────────────────────────
   THE COPY OVERLAY — the one real difference between the two products.

   JobMD.io is a replica of JobUp.dev: same landing page, same dashboard, same
   ecosystem, same colours. What changes is who the words are addressed to —
   doctors, surgeons and medical staff, and only them.

   IT IS AN OVERLAY, NOT A SECOND PAGE. The landing page already labels every
   string with a `data-i18n` key so the Spanish bundle can find it. This reuses
   those same keys: a brand supplies replacement text for the handful that read
   wrong to a surgeon, and every key it does NOT name keeps JobUp's wording.
   A second copy of the page would drift; a map of overrides cannot.

   Two consequences worth keeping:

   - A KEY THAT NO LONGER EXISTS IS REPORTED, NOT IGNORED. If someone rewrites
     the hero and drops `hero.lede`, the override for it silently stops applying
     and the medical page quietly reverts to "professional" wording that nobody
     notices for a month. `audit()` lists exactly that, and SIT fails on it.
   - THE SPANISH IS OVERRIDDEN TOO. Overriding only the English gives a page
     that speaks to surgeons until you press ES, which is worse than not
     translating at all.
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

/* JobMD — medical wording. Left-hand side is the data-i18n key on the page.
   `en` replaces the inline English; `es` replaces the Spanish bundle entry,
   keyed by the ORIGINAL English string the bundle uses as its lookup. */
const JOBMD = {
  'hero.eyebrow': {
    en: 'Medical Career Intelligence',
    es: 'Inteligencia de Carrera Médica'
  },
  // Mirrors JobUp's own headline rather than inventing a different promise —
  // the two products make the same offer to different people.
  'hero.h1': {
    en: 'Stop Looking for Positions.<br><span class="grad-text">Let your AI Agents find them while you sleep.</span>',
    es: 'Deja de buscar plazas.<br><span class="grad-text">Deja que tus agentes de IA las encuentren mientras duermes.</span>',
    html: true
  },
  'hero.lede': {
    en: 'Talk to the Orb or simply upload your CV. In minutes, {{BRAND}} builds your AI-powered ' +
        'medical career ecosystem &mdash; for doctors, surgeons and medical staff.',
    es: 'Habla con el Orbe o sube tu currículum. En minutos, {{BRAND}} construye tu ecosistema ' +
        'profesional médico con IA, para médicos, cirujanos y personal sanitario.'
  },
  'receive.02.h': { en: 'A professional CV site', es: 'Un sitio profesional de CV' },
  'receive.02.p': {
    en: 'Generated from your own CV and kept current automatically.',
    es: 'Generado a partir de tu propio currículum y actualizado automáticamente.'
  },
  'receive.03.p': {
    en: 'resume.json, JSON-LD, an agent card and an MCP endpoint, so machines understand your ' +
        'clinical career, not just read it.',
    es: 'resume.json, JSON-LD, una tarjeta de agente y un punto MCP, para que las máquinas ' +
        'entiendan tu carrera clínica, no solo la lean.'
  },
  'receive.04.p': {
    en: 'Real clinical openings from eight ATS platforms, scored and explained. Never invented.',
    es: 'Vacantes clínicas reales de ocho plataformas ATS, puntuadas y explicadas. Nunca inventadas.'
  },
  'receive.05.h': { en: 'Per-position tailoring', es: 'Adaptación por plaza' },
  'receive.05.p': {
    en: 'Your CV rewritten for a specific posting &mdash; using only what you already wrote.',
    es: 'Tu currículum reescrito para una vacante concreta, usando solo lo que ya escribiste.'
  }
};

const OVERLAYS = { jobmd: JOBMD };

/** The overlay for a brand, or null when it uses the engine's own wording. */
function forBrand(brand) {
  return (brand && OVERLAYS[brand.id]) || null;
}

function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Apply a brand's overlay to a rendered page.
 *
 * Matches on the data-i18n attribute the page already carries, so a key can
 * only be replaced where the page itself declared one — this cannot rewrite an
 * arbitrary sentence that happens to look similar.
 */
function applyHtml(html, brand) {
  const map = forBrand(brand);
  if (!map) return html;
  let out = String(html);
  Object.keys(map).forEach(function (key) {
    const entry = map[key];
    if (!entry || !entry.en) return;
    const attr = entry.html ? 'data-i18n-html' : 'data-i18n';
    // <tag ... data-i18n="key" ...>TEXT</tag>  — replace only TEXT.
    const re = new RegExp('(' + attr + '="' + esc(key) + '"[^>]*>)([\\s\\S]*?)(</)', 'g');
    out = out.replace(re, function (m, open, _body, close) { return open + entry.en + close; });

    // AND THE PAGE'S OWN SPANISH, which is an inline `JU_T.es` map keyed by the
    // SAME data-i18n key. Overriding only the English gave a landing page that
    // spoke to surgeons until you pressed ES and then spoke to office workers —
    // caught by clicking the toggle, invisible in the source.
    if (entry.es) {
      const kre = new RegExp("('" + esc(key) + "'\\s*:\\s*)'(?:[^'\\\\]|\\\\.)*'", 'g');
      out = out.replace(kre, function (m, lead) { return lead + jsQuote(entry.es); });
    }
  });
  return out;
}

/** Single-quoted JS string literal, escaped for injection into JU_T. */
function jsQuote(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ') + "'";
}

/**
 * Apply the overlay to the Spanish bundle.
 *
 * i18n.js maps ENGLISH SOURCE -> Spanish. Once the English has been replaced by
 * applyHtml, the old key no longer matches anything on the page, so the entry
 * is re-keyed to the new English. Skipping this step gives a page that speaks
 * to surgeons in English and to office workers in Spanish.
 */
function applyI18n(js, brand) {
  const map = forBrand(brand);
  if (!map) return js;
  let out = String(js);
  Object.keys(map).forEach(function (key) {
    const e = map[key];
    if (!e || !e.en || !e.es) return;
    // Add the new pair; the stale one is harmless because nothing looks it up.
    const pair = '\n  ' + JSON.stringify(stripTags(e.en)) + ': ' + JSON.stringify(stripTags(e.es)) + ',';
    out = out.replace(/(\{\s*\n)/, function (m) { return m + pair.replace(/^\n/, '') + '\n'; });
  });
  return out;
}

function stripTags(s) { return String(s).replace(/<[^>]+>/g, '').replace(/&mdash;/g, '—').trim(); }

/**
 * Which overridden keys are NOT on the page any more.
 *
 * An override for a key that has been renamed or deleted stops applying in
 * silence, and the medical page reverts to wording aimed at somebody else.
 * SIT calls this and fails on a non-empty result.
 */
function audit(html, brand) {
  const map = forBrand(brand);
  if (!map) return { brand: brand && brand.id, checked: 0, missing: [] };
  const missing = Object.keys(map).filter(function (key) {
    const attr = map[key].html ? 'data-i18n-html' : 'data-i18n';
    return String(html).indexOf(attr + '="' + key + '"') === -1;
  });
  return { brand: brand.id, checked: Object.keys(map).length, missing: missing };
}

module.exports = { OVERLAYS, forBrand, applyHtml, applyI18n, audit, stripTags };
