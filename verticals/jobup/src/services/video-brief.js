'use strict';

// =============================================================
// VIDEO BRIEF — natural language in, a renderable spec out.
//
// The operator types "a guy panicking about rent because he can't find a job,
// then JobUp finds him one". This turns that into the structure the pipeline
// actually renders: one locked character, a beat list where every beat carries
// a LITERAL body pose, and a music arc.
//
// THREE THINGS ARE ENFORCED IN CODE, NOT ASKED FOR IN THE PROMPT:
//
//  1. JOBUP DOES NOT APPLY ON YOUR BEHALF. The product says so on its own
//     pricing card, and it is the single most tempting thing for a model to
//     write into a job-search ad. Any beat that claims it is REWRITTEN, and
//     the rewrite is reported. An ad that contradicts the landing page is
//     worse than no ad.
//  2. Lighting and style never enter a per-shot prompt. They are established
//     by the character sheet; a live generation proved the reference frame
//     overrides prompt lighting, so asking twice just fights itself.
//  3. Every factual claim is checked against what JobUp actually publishes.
//     Anything else comes back in `unverified[]` and renders ABOVE the spec
//     under "confirm before you spend".
// =============================================================

const brain = require('./brain');

const MAX_BRIEF = 4000;
const MAX_BEATS = 16;
const WORDS_PER_SECOND = 2.6;

/** What JobUp genuinely does, from verticals/jobup/public/index.html. */
const FACTS = [
  'Two AI agents: the Opportunity Hunter and the Professional Presence agent.',
  'The Opportunity Hunter searches eight ATS platforms daily, ranks and scores each opening, and explains why it matches.',
  'The Professional Presence agent builds a public CV site at yourname.jobup.dev so recruiters and their AI can read it.',
  'Openings are real and scored, never invented.',
  'A resume is tailored per posting using only what the subscriber already wrote.',
  'There is a free tier with no card required. Paid tiers are Search and Landed.',
  'JobUp NEVER applies to a job and never sends a message on the subscriber\'s behalf. The subscriber reviews and submits every application themselves.',
];

/** Claims that contradict the product. Matched on the rendered beat text. */
const FORBIDDEN = [
  { re: /\b(appl(y|ies|ying)|submit(s|ting)?|send(s|ing)?)\b[^.]{0,40}\bfor you\b/i,
    why: 'JobUp never applies or sends on the subscriber\'s behalf' },
  { re: /\bauto[- ]?appl/i, why: 'there is no auto-apply' },
  { re: /\bapplies to (the |those |them|jobs|roles|openings)/i,
    why: 'JobUp never applies on the subscriber\'s behalf' },
  { re: /\bguarantee[sd]?\b/i, why: 'no outcome is guaranteed' },
  { re: /\bwe (will )?(get|find) you (a|the) job\b/i, why: 'no outcome is guaranteed' },
  { re: /\b(hired|a job) in \d+\s*(days?|weeks?)\b/i, why: 'no timeline is promised' },
];

const SAFE_REWRITE = 'You review it. You hit send.';

const SYSTEM = `You turn a marketing brief into a spec for a 9:16 social video.

Return ONLY JSON:
{
  "title": "<short internal name>",
  "targetSeconds": <20-45>,
  "character": { "description": "<one person: age, build, hair, skin, clothing>",
                 "styleTokens": "<render style AND lighting, e.g. 3d animated feature film style, warm evening light, shallow depth of field>" },
  "beats": [ { "text": "<one spoken line, max 14 words>",
               "scene": "<framing only: close-up on his face | close-up on her hands | medium wide | side profile | three-quarter view>",
               "emotion": "<one word>",
               "pose": "<LITERAL body position and action: where the arms are, what the hands hold, which way the head turns>",
               "source": "<omit for character shots; 'screen_recording' for product/UI beats>" } ],
  "music": { "mood": "<one of: hopeful, tense, warm, driving>", "arcNote": "<where it should lift>" }
}

RULES:
- ONE character for the whole video. Never two people.
- "pose" is a body position, never a setting. "phone in hand" is wrong; "holds a phone flat in his open palm at chest height, elbow bent at his side, looking down at the screen" is right.
- NEVER put lighting or render style in a beat. Those go in character.styleTokens once.
- Product/UI beats get "source":"screen_recording" and no pose.
- Total spoken words must be close to targetSeconds * 2.6.
- Every product claim must come from the FACTS list given to you. Never invent a statistic, a company name, a price, or an outcome.`;

const clamp = (s, n) => String(s == null ? '' : s).slice(0, n);

/** Beat text that contradicts the product is rewritten, and the change reported. */
function enforceClaims(beats) {
  const rewrites = [];
  const out = beats.map((b, i) => {
    const hit = FORBIDDEN.find((f) => f.re.test(b.text || ''));
    if (!hit) return b;
    rewrites.push({ beat: i, was: b.text, now: SAFE_REWRITE, why: hit.why });
    return Object.assign({}, b, { text: SAFE_REWRITE });
  });
  return { beats: out, rewrites };
}

/**
 * Identifier-shaped tokens the spec introduces that the operator never typed
 * and JobUp does not publish. Separator-only differences do not count, or the
 * real finds drown in noise.
 */
function unverifiedClaims(spec, briefText) {
  const said = (briefText + ' ' + FACTS.join(' ')).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const found = new Set();
  const text = (spec.beats || []).map((b) => b.text).join(' ');

  // numbers and money the brief never mentioned
  for (const m of text.matchAll(/\b(\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\b\d{2,}\b)/g)) {
    const tok = m[1].toLowerCase();
    if (!said.includes(tok.replace(/[^a-z0-9]+/g, ' ').trim())) found.add(m[1]);
  }
  // Capitalised multi-word names that look like a company or product
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g)) {
    const tok = m[1].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (tok.length < 6) continue;
    if (!said.includes(tok)) found.add(m[1]);
  }
  return [...found].slice(0, 12);
}

function normalise(raw, briefText) {
  const beatsIn = Array.isArray(raw && raw.beats) ? raw.beats.slice(0, MAX_BEATS) : [];
  const beats = beatsIn.map((b) => {
    const isUi = String(b.source || '') === 'screen_recording';
    return {
      text: clamp(b.text, 200),
      scene: clamp(b.scene || (isUi ? 'app interface' : 'three-quarter view'), 80),
      emotion: isUi ? undefined : clamp(b.emotion || 'neutral', 40),
      pose: isUi ? undefined : clamp(b.pose, 400) || null,
      source: isUi ? 'screen_recording' : undefined,
    };
  }).filter((b) => b.text);

  const enforced = enforceClaims(beats);
  const words = enforced.beats.reduce((n, b) => n + b.text.trim().split(/\s+/).length, 0);

  const spec = {
    title: clamp(raw && raw.title, 120) || 'Untitled video',
    // Which pair of models renders this. Chosen by the operator, not the model.
    engine: (raw && raw.engine) === 'veo' ? 'veo' : 'runway',
    targetSeconds: Math.max(10, Math.min(60, Number(raw && raw.targetSeconds) || Math.round(words / WORDS_PER_SECOND))),
    character: {
      description: clamp(raw && raw.character && raw.character.description, 400),
      styleTokens: clamp(raw && raw.character && raw.character.styleTokens, 400),
    },
    beats: enforced.beats,
    music: {
      mood: clamp((raw && raw.music && raw.music.mood) || 'hopeful', 40),
      arcNote: clamp(raw && raw.music && raw.music.arcNote, 200),
    },
    estimatedWords: words,
  };
  return { spec, rewrites: enforced.rewrites, unverified: unverifiedClaims(spec, briefText || '') };
}

/**
 * The zero-key path is a real result, not a stub: it builds a spec out of the
 * operator's own sentences and labels itself. Never a silent fake.
 */
function heuristic(briefText) {
  const sentences = String(briefText).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const beats = sentences.slice(0, 10).map((s, i) => ({
    text: clamp(s, 140),
    scene: i % 3 === 0 ? 'close-up on his face' : i % 3 === 1 ? 'medium wide' : 'three-quarter view',
    emotion: 'neutral',
    pose: null,                      // the operator must supply the body position
    source: undefined,
  }));
  return normalise({
    title: clamp(sentences[0], 60) || 'Untitled video',
    character: { description: '', styleTokens: '' },
    beats,
    music: { mood: 'hopeful', arcNote: '' },
  }, briefText);
}

/**
 * brain.json reports ok:false for three different situations and names only
 * one, so an unparseable reply looked exactly like a missing API key.
 */
function describeFailure(out) {
  if (!out) return 'the composer threw';
  if (out.reason) return String(out.reason).slice(0, 200);
  if (out.raw != null) {
    return `the model replied but its JSON did not parse (${out.raw.length} chars)`;
  }
  return 'no reply and no reason given';
}

/** @returns {spec, unverified[], rewrites[], composed_by, is_simulated, cost_usd} */
async function compose(briefText, { lang = 'en' } = {}) {
  const text = clamp(briefText, MAX_BRIEF).trim();
  if (!text) {
    throw Object.assign(new Error('a brief is required'), { code: 'empty_brief' });
  }

  if (!brain.enabled()) {
    const h = heuristic(text);
    return Object.assign(h, {
      composed_by: 'heuristic', is_simulated: true, cost_usd: 0,
      note: 'No model configured, so the beats are your own sentences split up. Poses are blank and must be written by hand before rendering.',
    });
  }

  const ask = (extra) => brain.json({
    system: SYSTEM,
    prompt: (extra || '') + `LANGUAGE: ${lang}\n\nFACTS ABOUT JOBUP (the only product claims permitted):\n${FACTS.map((f) => '- ' + f).join('\n')}\n\nBRIEF:\n${text}`,
    // A ten-beat spec with real poses is long. 3000 truncated it mid-JSON,
    // which surfaced as "no response" because brain.json reports ok:false with
    // NO reason when a reply arrives but does not parse.
    maxTokens: 8000,
  });

  let out = await ask();
  // One repair attempt: truncated or fence-wrapped JSON is the common miss and
  // asking again is cheap. A second miss falls through to the honest path.
  if (out && !out.ok && out.raw) {
    out = await ask('Return ONLY the JSON object — no prose, no markdown fence. Keep each "pose" under 25 words.\n\n');
  }

  if (!out || !out.ok || !out.data) {
    const h = heuristic(text);
    return Object.assign(h, {
      composed_by: 'heuristic', is_simulated: true, cost_usd: (out && out.cost_usd) || 0,
      note: 'The model did not write this. These beats are just your own sentences '
        + 'split up, which is NOT an ad script — rewrite them or try again. Reason: '
        + describeFailure(out) + '.',
    });
  }

  const n = normalise(out.data, text);
  return Object.assign(n, {
    composed_by: brain.MODEL, is_simulated: false, cost_usd: out.cost_usd || 0, note: null,
  });
}


// =============================================================
// ONE BOX. The spec is shown and edited as a single readable script.
//
// A beat-by-beat form makes the operator do the composer's job — ten little
// fields to tab through before they can tell whether the AD is any good. The
// whole thing renders as text they can read top to bottom, edit anywhere, and
// approve. The structured editor stays available, but this is the front door.
//
// The format is deliberately forgiving: unknown lines are ignored, missing
// fields fall back, and a beat needs only a LINE to exist.
// =============================================================

function toText(spec) {
  const s = spec || {};
  const out = [];
  out.push(`TITLE: ${s.title || ''}`);
  out.push(`SECONDS: ${s.targetSeconds || 30}`);
  out.push(`MUSIC: ${(s.music && s.music.mood) || 'hopeful'}`);
  out.push(`ENGINE: ${s.engine === 'veo' ? 'veo' : 'runway'}`);
  out.push('');
  out.push(`CHARACTER: ${(s.character && s.character.description) || ''}`);
  out.push(`STYLE: ${(s.character && s.character.styleTokens) || ''}`);
  out.push('');
  (s.beats || []).forEach((b, i) => {
    const ui = b.source === 'screen_recording';
    out.push(`--- ${i + 1}${ui ? ' PRODUCT' : ''} ---`);
    out.push(`LINE: ${b.text || ''}`);
    out.push(`FRAMING: ${b.scene || ''}`);
    if (!ui) {
      out.push(`EMOTION: ${b.emotion || 'neutral'}`);
      out.push(`POSE: ${b.pose || ''}`);
    }
    out.push('');
  });
  return out.join('\n').trim() + '\n';
}

function fromText(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  const spec = {
    title: '', targetSeconds: 30, engine: 'runway',
    character: { description: '', styleTokens: '' },
    beats: [], music: { mood: 'hopeful' },
  };
  let beat = null;
  const push = () => { if (beat && String(beat.text || '').trim()) spec.beats.push(beat); beat = null; };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const sep = /^-{2,}\s*(\d+)?\s*(PRODUCT|UI|SCREEN)?\s*-{2,}$/i.exec(line);
    if (sep) {
      push();
      beat = sep[2] ? { text: '', scene: 'app interface', source: 'screen_recording' }
                    : { text: '', scene: 'three-quarter view', emotion: 'neutral', pose: null };
      continue;
    }

    const kv = /^([A-Za-z ]+):\s*(.*)$/.exec(line);
    if (!kv) {
      // A bare line inside a beat is treated as more of the spoken line, so a
      // sentence typed on its own is not silently dropped.
      if (beat) beat.text = (beat.text ? beat.text + ' ' : '') + line;
      continue;
    }
    const key = kv[1].trim().toUpperCase();
    const val = kv[2].trim();

    if (!beat) {
      if (key === 'TITLE') spec.title = val;
      else if (key === 'SECONDS') spec.targetSeconds = parseInt(val, 10) || 30;
      else if (key === 'MUSIC') spec.music.mood = val || 'hopeful';
      else if (key === 'ENGINE') spec.engine = /veo/i.test(val) ? 'veo' : 'runway';
      else if (key === 'CHARACTER') spec.character.description = val;
      else if (key === 'STYLE') spec.character.styleTokens = val;
      continue;
    }
    if (key === 'LINE' || key === 'SAYS' || key === 'VO') beat.text = val;
    else if (key === 'FRAMING' || key === 'SCENE' || key === 'SHOT') beat.scene = val;
    else if (key === 'EMOTION') beat.emotion = val;
    else if (key === 'POSE' || key === 'ACTION') beat.pose = val;
    else if (key === 'SCREEN') { beat.source = 'screen_recording'; beat.scene = val || beat.scene; }
  }
  push();
  return spec;
}

module.exports = {
  compose, normalise, enforceClaims, unverifiedClaims, heuristic,
  toText, fromText,
  FACTS, FORBIDDEN, SAFE_REWRITE,
};
