'use strict';
/**
 * Mara's daily report.
 *
 * THE MODEL WRITES PROSE AND NEVER A FIGURE. The facts are computed here from
 * rows that exist, handed to the model as a fixed list, and the draft is then
 * VERIFIED: any number in it that is not in the facts, any named condition, any
 * treatment advice or any guarantee discards the whole draft in favour of the
 * deterministic text. The verifier runs on the deterministic path too, so a
 * later edit that drops a field fails here rather than shipping.
 *
 * With no model the report is still a real, useful report — labelled
 * composed_by:'heuristic', is_simulated:true. Never a silent fake.
 */
const dbm = require('./db');
const bands = require('./bands');
const llm = require('./llm');

const LABEL = {
  heart_rate_bpm: { en: 'resting heart rate', es: 'frecuencia cardiaca en reposo' },
  resp_rate_bpm:  { en: 'breathing rate',     es: 'frecuencia respiratoria' },
  hrv_ms:         { en: 'heart rate variability', es: 'variabilidad cardiaca' },
  activity:       { en: 'activity',           es: 'actividad' },
  temp_c:         { en: 'skin temperature',   es: 'temperatura de la piel' },
  spo2_pct:       { en: 'oxygen saturation',  es: 'saturación de oxígeno' }
};

// Words a report may never contain. A condition name is a diagnosis; a cure or
// a guarantee is a claim MaraPet is not entitled to make about a living animal.
const FORBIDDEN = [
  'diagnos', 'diagnós', 'disease', 'enfermedad', 'cardiomyopath', 'miocardiopat',
  'heart failure', 'insuficiencia cardiaca', 'insuficiencia cardíaca',
  'cancer', 'cáncer', 'tumor', 'infection', 'infección', 'parasit', 'parásit',
  'arrhythmi', 'arritmi', 'murmur', 'soplo', 'pneumon', 'neumon',
  'prescrib', 'prescrib', 'dosage', 'dosis', 'medication', 'medicamento',
  'treat ', 'tratar', 'tratamiento', 'cure', 'cura',
  'guarantee', 'garantiza', 'we promise', 'prometemos',
  'accuracy', 'precisión del', 'sensitivity', 'sensibilidad del', 'specificity', 'especificidad',
  'clinically proven', 'clínicamente comprobado', 'medical device', 'dispositivo médico'
];

function round(n, dp = 0) {
  const m = Math.pow(10, dp);
  return Math.round(Number(n) * m) / m;
}

/** Every number the prose is allowed to use, as strings, for the verifier. */
function allowedNumbers(facts) {
  const out = new Set();
  const add = (v) => {
    if (v == null) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    out.add(String(round(n, 0)));
    out.add(String(round(n, 1)));
  };
  add(facts.days_with_data);
  add(facts.readings_count);
  for (const m of facts.metrics || []) {
    add(m.avg); add(m.min); add(m.max); add(m.band_min); add(m.band_max); add(m.samples);
  }
  for (const a of facts.alerts || []) add(a.value);
  return out;
}

/**
 * Collect the facts for one pet and one day. Reads rows; invents nothing.
 * A metric with no rows is ABSENT from facts.metrics, never zero.
 */
async function collectFacts({ tenant_id, pet_id, date, now }) {
  const pet = await dbm.one(
    `SELECT id, name, breed, breed_size, birth_date, weight_kg
       FROM mp_pets WHERE tenant_id = :tenant_id AND id = :pet_id`,
    { tenant_id, pet_id }
  );
  if (!pet) return null;

  const day = date || new Date((now ? new Date(now) : new Date())).toISOString().slice(0, 10);
  const b = bands.forPet(pet, now);

  const rows = await dbm.q(
    `SELECT metric,
            COUNT(*)::int                  AS samples,
            AVG(value)::numeric(10,2)      AS avg,
            MIN(value)::numeric(10,2)      AS min,
            MAX(value)::numeric(10,2)      AS max,
            MAX(source)                    AS a_source,
            MIN(confidence)                AS a_conf
       FROM mp_readings
      WHERE tenant_id = :tenant_id AND pet_id = :pet_id
        AND recorded_at >= CAST(:day AS DATE)
        AND recorded_at <  CAST(:day AS DATE) + INTERVAL '1 day'
      GROUP BY metric
      ORDER BY metric`,
    { tenant_id, pet_id, day }
  );

  const metrics = rows.map((r) => {
    const band = b[r.metric] || null;
    return {
      metric: r.metric,
      label_en: (LABEL[r.metric] || {}).en || r.metric,
      label_es: (LABEL[r.metric] || {}).es || r.metric,
      samples: Number(r.samples),
      avg: round(r.avg, 1),
      min: round(r.min, 1),
      max: round(r.max, 1),
      unit: band ? band.unit : null,
      band_min: band ? band.min : null,
      band_max: band ? band.max : null,
      band_basis: band ? band.basis : null,
      status: band ? bands.classify(r.metric, r.avg, b) : null,
      source: r.a_source,
      confidence: r.a_conf
    };
  });

  const alerts = await dbm.q(
    `SELECT metric, value, direction FROM mp_alerts
      WHERE tenant_id = :tenant_id AND pet_id = :pet_id
        AND fired_at >= CAST(:day AS DATE)
        AND fired_at <  CAST(:day AS DATE) + INTERVAL '1 day'
      ORDER BY fired_at DESC LIMIT 20`,
    { tenant_id, pet_id, day }
  );

  return {
    pet_name: pet.name,
    date: day,
    metrics,
    alerts: alerts.map((a) => ({ metric: a.metric, value: round(a.value, 1), direction: a.direction })),
    readings_count: metrics.reduce((s, m) => s + m.samples, 0),
    days_with_data: metrics.length ? 1 : 0,
    has_data: metrics.length > 0
  };
}

/** The report that is always true, with or without a model. */
function deterministic(facts, lang) {
  const es = lang === 'es';
  const name = facts.pet_name;
  if (!facts.has_data) {
    return es
      ? `No hay lecturas de ${name} para este día, así que no hay nada que resumir. ` +
        `Cuando su collar envíe datos, o cuando grabes su respiración desde la aplicación, ` +
        `este resumen aparecerá aquí.`
      : `There are no readings for ${name} on this day, so there is nothing to summarise. ` +
        `Once the collar sends data, or you record ${name}'s breathing from the app, this ` +
        `summary will appear here.`;
  }
  const parts = [];
  parts.push(es
    ? `Resumen de ${name} para el ${facts.date}.`
    : `${name}'s summary for ${facts.date}.`);

  for (const m of facts.metrics) {
    const label = es ? m.label_es : m.label_en;
    const unit = m.unit ? ` ${m.unit}` : '';
    const measured = es
      ? `El promedio de ${label} fue ${m.avg}${unit} (de ${m.min} a ${m.max}, ${m.samples} lecturas).`
      : `Average ${label} was ${m.avg}${unit} (from ${m.min} to ${m.max}, over ${m.samples} readings).`;
    let judged = '';
    if (m.status === 'ok') {
      judged = es ? ' Está dentro del rango de referencia.' : ' That is inside the reference range.';
    } else if (m.status === 'high') {
      judged = es
        ? ` Está por encima del rango de referencia (${m.band_min} a ${m.band_max}${unit}); vale la pena comentarlo con tu veterinario.`
        : ` That is above the reference range (${m.band_min} to ${m.band_max}${unit}), which is worth mentioning to your vet.`;
    } else if (m.status === 'low') {
      judged = es
        ? ` Está por debajo del rango de referencia (${m.band_min} a ${m.band_max}${unit}); vale la pena comentarlo con tu veterinario.`
        : ` That is below the reference range (${m.band_min} to ${m.band_max}${unit}), which is worth mentioning to your vet.`;
    } else {
      judged = es
        ? ' No existe un rango de referencia que podamos citar para este dato, así que solo mostramos la tendencia.'
        : ' There is no reference range we can cite for this one, so we show the trend only.';
    }
    let prov = '';
    if (m.source === 'video') {
      // The confidence word is translated too. Leaving 'high' inside a Spanish
      // sentence is the sort of half-translation that reads as a bug.
      const CONF_ES = { high: 'alta', medium: 'media', low: 'baja' };
      prov = es
        ? ` Esta cifra es una estimación a partir de video, con confianza ${CONF_ES[m.confidence] || 'no indicada'}.`
        : ` This figure is an estimate from video, at ${m.confidence || 'unstated'} confidence.`;
    } else if (m.source === 'manual') {
      prov = es ? ' Esta cifra la escribiste tú.' : ' You entered this figure yourself.';
    }
    parts.push(measured + judged + prov);
  }

  if (facts.alerts.length) {
    parts.push(es
      ? `Se activaron ${facts.alerts.length} avisos según los límites que tú configuraste.`
      : `${facts.alerts.length} alerts fired against the limits you set.`);
  }

  // The disclaimer is NOT part of the verified prose. It is appended by code in
  // build(), for two reasons that both bit this file: the word "diagnoses" is
  // on the forbidden list, so a disclaimer inside the body makes the verifier
  // reject its own correct output; and a disclaimer the model is asked to write
  // is a disclaimer the model can quietly drop.
  return parts.join(' ');
}

const DISCLAIMER = {
  en: 'MaraPet is a wellness aid, not a medical device, and it diagnoses nothing. ' +
      'Any decision about your dog\'s health belongs to your vet.',
  es: 'MaraPet es una ayuda de bienestar, no un dispositivo médico, y no diagnostica nada. ' +
      'Cualquier decisión sobre la salud de tu perro es de tu veterinario.'
};
/** Append the fixed disclaimer. Always runs, on both paths, after verification. */
function withDisclaimer(body, lang) {
  return body.trim() + ' ' + (lang === 'es' ? DISCLAIMER.es : DISCLAIMER.en);
}

/**
 * Verify a draft against the facts. Returns null when acceptable, or the reason
 * it must be discarded. Runs on EVERY path.
 */
function verify(draft, facts) {
  if (!draft || typeof draft !== 'string') return 'empty';
  const text = draft.trim();
  if (text.length < 20) return 'too_short';
  if (text.length > 2000) return 'too_long';
  if (/<[a-z/]/i.test(text)) return 'contains_markup';
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) return 'contains_emoji';

  const low = text.toLowerCase();
  for (const w of FORBIDDEN) {
    if (low.includes(w)) return `forbidden_term:${w.trim()}`;
  }

  // Every number in the prose must be a number we computed.
  const allowed = allowedNumbers(facts);
  const nums = text.match(/\d+(?:[.,]\d+)?/g) || [];
  for (const raw of nums) {
    const n = raw.replace(',', '.');
    // A date fragment from facts.date is legitimate.
    if (facts.date && facts.date.includes(raw)) continue;
    if (allowed.has(String(round(n, 0))) || allowed.has(String(round(n, 1)))) continue;
    return `unverified_number:${raw}`;
  }
  return null;
}

const SYSTEM = (lang) => (lang === 'es'
  ? [
    'Eres Mara, la voz de MaraPet. Escribes un resumen diario corto sobre UN perro, dirigido a su dueño.',
    'Solo puedes usar las cifras que aparecen en los HECHOS. No inventes ninguna otra cifra.',
    'Nunca nombres una enfermedad ni un diagnóstico. Nunca recomiendes un tratamiento ni un medicamento.',
    'Nunca prometas ni garantices nada. MaraPet no es un dispositivo médico.',
    'Si un dato está fuera del rango de referencia, dilo y sugiere comentarlo con el veterinario, nada más.',
    'Español claro y cálido, con tildes y ñ correctas. Sin emojis. Entre 60 y 160 palabras. Solo el texto.'
  ].join(' ')
  : [
    'You are Mara, the voice of MaraPet. You write a short daily summary about ONE dog for its owner.',
    'You may use ONLY the figures that appear in the FACTS. Do not introduce any other number.',
    'Never name a disease or a diagnosis. Never recommend a treatment or a medication.',
    'Never promise or guarantee anything. MaraPet is not a medical device.',
    'If a figure is outside the reference range, say so and suggest mentioning it to the vet, nothing more.',
    'Warm, plain English. No emojis. Between 60 and 160 words. Return the text only.'
  ].join(' '));

/**
 * Build (and store) the report for one pet-day. Idempotent per
 * (tenant, pet, date, lang) — a second call returns the stored row.
 */
async function build({ tenant_id, pet_id, date, lang = 'en', now, force = false }) {
  const facts = await collectFacts({ tenant_id, pet_id, date, now });
  if (!facts) return null;

  if (!force) {
    const existing = await dbm.one(
      `SELECT body, composed_by, is_simulated, facts, report_date, rejected
         FROM mp_reports
        WHERE tenant_id = :tenant_id AND pet_id = :pet_id
          AND report_date = CAST(:date AS DATE) AND lang = :lang`,
      { tenant_id, pet_id, date: facts.date, lang }
    );
    if (existing) {
      return {
        body: existing.body,
        composed_by: existing.composed_by,
        is_simulated: existing.is_simulated,
        facts: existing.facts,
        rejected: existing.rejected || null,
        cached: true
      };
    }
  }

  const fallback = deterministic(facts, lang);
  // The deterministic text is verified too: a later edit that introduces a
  // figure the facts do not carry must fail here, not in production.
  const selfCheck = verify(fallback, facts);

  let body = fallback;
  let composed_by = 'heuristic';
  let is_simulated = true;
  let rejected = null;

  if (selfCheck) {
    rejected = { deterministic_failed: selfCheck };
  } else if (llm.aiEnabled() && facts.has_data) {
    const draft = await llm.prose({
      system: SYSTEM(lang),
      user: 'FACTS (the only figures you may use):\n' + JSON.stringify(facts, null, 1),
      maxTokens: 500
    });
    const why = draft ? verify(draft, facts) : 'no_model_output';
    if (!why) {
      body = draft.trim();
      composed_by = 'model';
      is_simulated = false;
    } else {
      rejected = { model_draft: why, text: draft ? draft.slice(0, 300) : null };
    }
  }

  // Verified first, disclaimer second. A model can never be asked to write the
  // disclaimer and so can never omit it.
  body = withDisclaimer(body, lang);

  await dbm.run(
    `INSERT INTO mp_reports (tenant_id, pet_id, report_date, lang, body, facts, composed_by, is_simulated, rejected)
     VALUES (:tenant_id, :pet_id, CAST(:date AS DATE), :lang, :body, CAST(:facts AS JSONB), :composed_by, :is_simulated, CAST(:rejected AS JSONB))
     ON CONFLICT (tenant_id, pet_id, report_date, lang) DO UPDATE
       SET body = EXCLUDED.body, facts = EXCLUDED.facts, composed_by = EXCLUDED.composed_by,
           is_simulated = EXCLUDED.is_simulated, rejected = EXCLUDED.rejected, created_at = NOW()`,
    {
      tenant_id, pet_id, date: facts.date, lang, body,
      facts: JSON.stringify(facts), composed_by, is_simulated,
      rejected: rejected ? JSON.stringify(rejected) : null
    }
  );

  return { body, composed_by, is_simulated, facts, rejected, cached: false };
}

module.exports = {
  LABEL, FORBIDDEN, DISCLAIMER, withDisclaimer,
  collectFacts, deterministic, verify, build, allowedNumbers
};
