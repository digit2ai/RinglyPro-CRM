'use strict';

/**
 * THE SCORECARD — three lanes, Red / Yellow / Green, and one safe next step.
 *
 * This is the artifact the CEO actually looks at. Everything else in the
 * deliverable exists to justify it.
 *
 * Two design rules that are easy to get wrong:
 *
 *   1. THE OVERALL VERDICT IS NOT AN AVERAGE. A red Data lane with a blocking
 *      item stops a pilot no matter how green the other two are, and averaging
 *      would hide that behind a comfortable yellow. Blockers dominate; the
 *      other lanes shape the recommendation, not whether one is possible.
 *
 *   2. THERE IS ALWAYS A SAFE NEXT STEP. The department's purpose is to move a
 *      CEO from fear to confidence, and "you are not ready, come back later"
 *      is the one output that cannot do that. When every lane is red the next
 *      step is smaller — a two-day scoping exercise instead of a four-week
 *      pilot — but it is never absent, and it is never dressed up as more than
 *      it is.
 *
 * Deterministic: the ratings come from the lane engines, which are arithmetic.
 * No model participates in producing a colour.
 */

const RATING_ORDER = { red: 0, yellow: 1, green: 2 };

const LANES = [
  { key: 'cost', title: { en: 'Cost Comfort', es: 'Comodidad con el Costo' },
    question: { en: 'Can you afford to find out, and does the arithmetic work?',
                es: '¿Puede permitirse averiguarlo, y cuadran las cuentas?' } },
  { key: 'risk', title: { en: 'Risk Comfort', es: 'Comodidad con el Riesgo' },
    question: { en: 'If it goes wrong, what exactly happens, and can you stop it?',
                es: 'Si sale mal, ¿qué ocurre exactamente y puede detenerlo?' } },
  { key: 'data', title: { en: 'Data Readiness', es: 'Preparación de los Datos' },
    question: { en: 'Is there enough to build the first thing on?',
                es: '¿Hay suficiente para construir lo primero?' } }
];

/**
 * @param {object} findings  { cost, risk, data } — lane engine outputs
 * @param {string} lang
 */
function build(findings = {}, lang = 'en') {
  const L = (o) => (o && (o[lang] || o.en)) || '';

  const lanes = LANES.map(def => {
    const f = findings[def.key] || {};
    return {
      key: def.key,
      title: L(def.title),
      question: L(def.question),
      score: typeof f.score === 'number' ? f.score : null,
      rating: f.rating || 'unknown',
      // The one line that matters under each colour.
      headline: laneHeadline(def.key, f, lang),
      what_would_move_it: Array.isArray(f.to_green) ? f.to_green.slice(0, 3) : [],
      reasons: Array.isArray(f.reasons) ? f.reasons : []
    };
  });

  /* ── the overall verdict ──────────────────────────────────────────────── */
  const dataBlocked = (findings.data && findings.data.can_start_phase_1 === false);
  const noSafeScope = !!(findings.risk && findings.risk.pilot && !(findings.risk.pilot.scope || []).length);
  const costDoesNotFit = !!(findings.cost && findings.cost.fits_ceiling === false);
  const worst = lanes.reduce((w, l) => {
    const r = RATING_ORDER[l.rating];
    return (r !== undefined && r < w) ? r : w;
  }, 2);

  let verdict, verdict_label, confidence;

  if (dataBlocked || noSafeScope) {
    verdict = 'remediate_first';
    verdict_label = { en: 'One thing has to be fixed before a pilot — and it is measured in days.',
                      es: 'Hay que resolver una cosa antes del piloto — y se mide en días.' };
  } else if (costDoesNotFit || worst === 0) {
    verdict = 'narrow_pilot';
    verdict_label = { en: 'Start, but start narrower than you were probably expecting.',
                      es: 'Empiece, pero más estrecho de lo que probablemente esperaba.' };
  } else if (worst === 1) {
    verdict = 'pilot';
    verdict_label = { en: 'Run the pilot. The open items do not need to be closed first.',
                      es: 'Ejecute el piloto. Los pendientes no necesitan resolverse antes.' };
  } else {
    verdict = 'pilot';
    verdict_label = { en: 'Run the pilot. Nothing here argues for waiting.',
                      es: 'Ejecute el piloto. Nada aquí justifica esperar.' };
  }

  // Confidence is about the completeness of what we were told, not optimism.
  const answeredLanes = lanes.filter(l => l.score !== null).length;
  confidence = answeredLanes === 3 ? 'high' : answeredLanes === 2 ? 'medium' : 'low';

  /* ── the safe next step ───────────────────────────────────────────────── */
  const next = safeNextStep({ verdict, findings, lang });

  return {
    lanes,
    verdict,
    verdict_label: L(verdict_label),
    confidence,
    confidence_note: confidence === 'high'
      ? 'All three lanes were assessed from answers you gave.'
      : 'Some lanes were assessed on partial information. The gaps are named rather than filled in.',
    safe_next_step: next,
    overall_rating: worst === 2 ? 'green' : worst === 1 ? 'yellow' : 'red',
    legend: {
      green: L({ en: 'No obstacle. Proceed.', es: 'Sin obstáculo. Avance.' }),
      yellow: L({ en: 'Real open items, none of which require waiting.', es: 'Pendientes reales, ninguno exige esperar.' }),
      red: L({ en: 'Something must change before this lane supports a pilot. What, and how long, is stated.', es: 'Algo debe cambiar antes de que este carril soporte un piloto. Se indica qué y cuánto toma.' })
    },
    computed_by: 'deterministic'
  };
}

function laneHeadline(key, f, lang) {
  const es = lang === 'es';
  if (!f || f.rating === undefined) return es ? 'Sin evaluar.' : 'Not assessed.';

  if (key === 'cost') {
    const cdn = f.cost_of_doing_nothing || {};
    const p1 = (f.phases && f.phases.phase_1) || {};
    if (!cdn.total_annual_usd) return es ? 'No se dieron horas ni tarifas, así que no hay cifra de costo que reportar.' : 'No hours or rates were given, so there is no cost figure to report.';
    const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
    if (f.fits_ceiling === false) {
      return es
        ? `El piloto cuesta ${fmt(p1.build_usd ? p1.build_usd.mid : 0)} frente al techo de ${fmt(f.ceiling_usd || 0)} que usted fijó. Se puede estrechar.`
        : `The pilot costs ${fmt(p1.build_usd ? p1.build_usd.mid : 0)} against the ${fmt(f.ceiling_usd || 0)} ceiling you set. It can be narrowed.`;
    }
    return es
      ? `Ya gasta ${fmt(cdn.total_annual_usd)} al año haciendo este trabajo a mano. La exposición máxima del piloto es ${fmt(p1.max_exposure_usd || 0)}.`
      : `You already spend ${fmt(cdn.total_annual_usd)} a year doing this work by hand. Your maximum exposure on the pilot is ${fmt(p1.max_exposure_usd || 0)}.`;
  }

  if (key === 'risk') {
    const n = (f.register || []).length;
    if (!n) return es ? 'No se nombraron riesgos específicos, así que no hay ninguno gestionado todavía.' : 'No specific risks were named, so none are managed yet.';
    return es
      ? `${n} riesgo(s) que usted nombró tienen salvaguarda, responsable y evidencia. El piloto se detiene bajo cuatro condiciones escritas.`
      : `${n} risk(s) you named have a guardrail, an owner and a piece of evidence. The pilot stops under four written conditions.`;
  }

  if (key === 'data') return f.headline || (es ? 'Sin evaluar.' : 'Not assessed.');
  return '';
}

/**
 * The next step. Always concrete, always small, always something the CEO can
 * say yes to in the meeting without another approval cycle.
 */
function safeNextStep({ verdict, findings, lang }) {
  const es = lang === 'es';
  const cost = findings.cost || {};
  const risk = findings.risk || {};
  const data = findings.data || {};
  const p1 = (cost.phases && cost.phases.phase_1) || {};
  const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');

  if (verdict === 'remediate_first') {
    const items = (data.blocking || []).map(b => b.fix);
    const days = (data.blocking || []).reduce((a, b) => a + (b.effort_days || 0), 0) || 2;
    return {
      step: es ? 'Una sesión de alcance de dos días, no un piloto todavía.' : 'A two-day scoping exercise, not a pilot yet.',
      why: es
        ? `Hay ${(data.blocking || []).length} elemento(s) que realmente impiden construir. Se resuelven en unos ${days} días, no en meses.`
        : `There are ${(data.blocking || []).length} item(s) that genuinely prevent building. They take about ${days} days to clear, not months.`,
      actions: items.length ? items : [es ? 'Identificar un proceso interno, no regulado, cuyo resultado ningún cliente ve.' : 'Identify one internal, non-regulated process whose output no customer sees.'],
      commitment: es ? 'Nada recurrente. Nada que cancelar.' : 'Nothing recurring. Nothing to cancel.',
      exposure_usd: 0,
      you_can_stop_after: true
    };
  }

  if (verdict === 'narrow_pilot') {
    const one = (cost.pilot_scope || [])[0];
    const stepCost = (cost.budget_path || [])[0];
    return {
      step: es
        ? `Un solo proceso — ${one ? one.name : 'el de mayor carga horaria'} — durante ${(risk.pilot && risk.pilot.duration_weeks) || 4} semanas.`
        : `A single process — ${one ? one.name : 'the one with the most hours in it'} — for ${(risk.pilot && risk.pilot.duration_weeks) || 4} weeks.`,
      why: es
        ? 'Estrechar el alcance a uno lo mete bajo el techo que usted fijó y reduce la exposición a un pago único.'
        : 'Narrowing to one puts it under the ceiling you set and reduces your exposure to a single payment.',
      actions: [
        es ? 'Fijar por escrito el umbral de precisión y el objetivo de horas, antes de empezar.' : 'Set the accuracy threshold and the hours target in writing, before starting.',
        es ? 'Nombrar a la persona que puede detenerlo sin reunión.' : 'Name the person who can stop it without a meeting.',
        es ? 'Aprobar la lista de campos que salen de sus sistemas.' : 'Approve the list of fields that leave your systems.'
      ],
      commitment: es ? 'Pago único. Sin costo recurrente hasta que funcione.' : 'One payment. No recurring cost until it works.',
      exposure_usd: stepCost ? stepCost.spend_usd : (p1.max_exposure_usd || null),
      you_can_stop_after: true
    };
  }

  return {
    step: es
      ? `Un piloto de ${(risk.pilot && risk.pilot.duration_weeks) || 4} semanas sobre ${(cost.pilot_scope || []).length} proceso(s) interno(s), con una persona revisando cada salida.`
      : `A ${(risk.pilot && risk.pilot.duration_weeks) || 4}-week pilot on ${(cost.pilot_scope || []).length} internal process(es), with a person reviewing every output.`,
    why: es
      ? `Su exposición máxima es ${fmt(p1.max_exposure_usd)}. Se apaga en la misma tarde y usted conserva todo lo producido.`
      : `Your maximum exposure is ${fmt(p1.max_exposure_usd)}. It switches off the same afternoon and you keep everything produced.`,
    actions: [
      es ? 'Fijar por escrito el umbral de precisión y el objetivo de horas.' : 'Set the accuracy threshold and the hours target in writing.',
      es ? 'Nombrar a la persona con autoridad para detenerlo.' : 'Name the person with authority to stop it.',
      es ? 'Aprobar la lista de campos que salen de sus sistemas.' : 'Approve the list of fields that leave your systems.',
      es ? 'Declarar por escrito su intención sobre el personal antes de anunciarlo.' : 'State your headcount intent in writing before it is announced.'
    ],
    commitment: es ? 'Pago único más un mes de operación. Sin compromiso más allá de la compuerta.' : 'One payment plus one month of running cost. No commitment past the gate.',
    exposure_usd: p1.max_exposure_usd || null,
    you_can_stop_after: true
  };
}

module.exports = { build, LANES, safeNextStep };
