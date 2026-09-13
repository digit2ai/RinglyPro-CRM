'use strict';

/**
 * The narrative ("your agent's take"). Assembled from verified facts in both
 * languages. A model may rewrite it for warmth; the rewrite is DISCARDED if it
 * introduces any figure, date or proper noun the deterministic text and the
 * facts do not already contain.
 */

const { t, money, dateLabel } = require('./i18n');
const { renderFitLine } = require('./fit');
const llm = require('../services/llm');
const { numericTokens } = require('./compliance');

function deterministic(lang, items) {
  const n = {
    opening: items.length ? t(lang, 'narrative.opening_some', { n: items.length }) : t(lang, 'narrative.opening_none'),
    watch_outs: [], questions_to_ask: ['q1', 'q2', 'q3', 'q4'].map((k) => t(lang, 'narrative.' + k)),
    next_step: t(lang, 'narrative.next_step')
  };
  const takes = {};
  items.slice(0, 3).forEach((it) => {
    const reasons = it.fit_raw.reasons.slice(0, 2).map((r) => renderFitLine(lang, r)).join(' ');
    takes[it.key] = t(lang, 'narrative.top_pick', { community: it.community.name, builder: it.community.builder, reasons });
  });
  for (const it of items) {
    if (!it.fees_known) n.watch_outs.push(t(lang, 'narrative.watch_fees', { community: it.community.name }));
    for (const inc of it.incentive_rows) {
      if (inc.requires_affiliated_lender === true) n.watch_outs.push(t(lang, 'narrative.watch_lender', { community: it.community.name, headline: inc.type_label }));
      if (inc.close_by) n.watch_outs.push(t(lang, 'narrative.watch_close_by', { community: it.community.name, headline: inc.type_label, date: dateLabel(lang, inc.close_by) }));
    }
    const bd = it.scenario_rows.find((s) => s.type === 'rate_buydown_temporary' && s.modeled && s.year3plus != null);
    if (bd) n.watch_outs.push(t(lang, 'narrative.watch_buydown', { community: it.community.name, amount: money(lang, bd.year3plus) }));
  }
  n.watch_outs = [...new Set(n.watch_outs)].slice(0, 8);
  return { narrative: n, takes };
}

function properNouns(s) {
  return (String(s).match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*/g) || []);
}

/** Accept a model rewrite only if it adds no figure and no name. */
function acceptRewrite(original, rewritten, factsText) {
  if (!rewritten || typeof rewritten !== 'string' || rewritten.length > original.length * 2 + 200) return false;
  const allowedDigits = new Set(numericTokens(original + ' ' + factsText).map((x) => x.d));
  for (const { d } of numericTokens(rewritten)) if (!allowedDigits.has(d)) return false;
  const allowedWords = new Set(properNouns(original + ' ' + factsText).flatMap((p) => p.split(/\s+/)));
  const firstWords = new Set((rewritten.match(/(?:^|[.!?]\s+)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/g) || []).map((w) => w.replace(/^[.!?\s]+/, '')));
  for (const p of properNouns(rewritten)) {
    for (const w of p.split(/\s+/)) if (!allowedWords.has(w) && !firstWords.has(w)) return false;
  }
  return true;
}

async function narrate(lang, items, { allowModel = true, agentName = null } = {}) {
  const base = deterministic(lang, items);
  if (!allowModel || !llm.configured() || !items.length) return Object.assign(base, { generated_by: 'heuristic' });
  const facts = JSON.stringify(items.map((it) => ({ community: it.community.name, builder: it.community.builder, city: it.community.city })));
  try {
    const out = await llm.json({
      model: process.env.INCENTIVA_ADVISOR_MODEL || 'claude-sonnet-5',
      system: `You rewrite short passages of a new-home report so they read warmly and plainly, in the first person, as ${agentName || 'the buyer\'s agent'} would write. Language: ${lang === 'es' ? 'Spanish (use usted, correct accents)' : 'English'}. Keep every fact. Do not add any number, date, price, rate, name, place, school, neighborhood description or promise. Never describe who lives somewhere. No emojis, no exclamation marks. Return JSON only with the same keys.`,
      user: JSON.stringify({ opening: base.narrative.opening, takes: base.takes }),
      max_tokens: 1200
    });
    let changed = false;
    if (out && acceptRewrite(base.narrative.opening, out.opening, facts)) { base.narrative.opening = out.opening; changed = true; }
    if (out && out.takes) for (const k of Object.keys(base.takes)) {
      if (acceptRewrite(base.takes[k], out.takes[k], facts)) { base.takes[k] = out.takes[k]; changed = true; }
    }
    return Object.assign(base, { generated_by: changed ? 'model' : 'heuristic' });
  } catch (e) {
    return Object.assign(base, { generated_by: 'heuristic' });
  }
}

module.exports = { narrate, deterministic, acceptRewrite };
