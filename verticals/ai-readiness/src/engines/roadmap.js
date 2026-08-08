'use strict';

/**
 * ROADMAP BUILDER ENGINE — assembles the deliverable.
 *
 * Three phases, each carrying cost, risk level, data requirements, timeline
 * and success metrics, plus the gate that must be passed to reach the next
 * one. The gates are the product. A roadmap without them is a wish list, and
 * a CEO who has been oversold before can tell the difference immediately.
 *
 * Two things this refuses to do:
 *
 *   - PRICE PHASE 3. Costing a transformation against today's unknowns
 *     produces a number that is wrong by an order of magnitude, and it is
 *     precisely that number that teaches CEOs to distrust these documents.
 *     Phase 3 carries direction and preconditions, not a figure.
 *
 *   - PROMISE AN OUTCOME. Success metrics state what will be MEASURED and by
 *     whom. Where a target appears it is described as agreed at kickoff, not
 *     asserted here.
 *
 * It also emits a TALK TRACK: what the human sponsor says out loud, section by
 * section, including the answers to the three objections that actually get
 * raised. The department is designed to be presented by a person, and a
 * deliverable a sponsor cannot confidently narrate does not get presented.
 */

const cost = require('./cost');

const T = {
  en: {
    p1: 'Phase 1 — Prove it on one thing',
    p2: 'Phase 2 — Expand what worked',
    p3: 'Phase 3 — Change how the work is done',
    gate: 'Gate to the next phase'
  },
  es: {
    p1: 'Fase 1 — Probarlo en una sola cosa',
    p2: 'Fase 2 — Expandir lo que funcionó',
    p3: 'Fase 3 — Cambiar cómo se hace el trabajo',
    gate: 'Compuerta hacia la siguiente fase'
  }
};

/**
 * @param {object} ctx
 *   engagement, findings {cost,risk,data}, scorecard, lang
 */
function build(ctx = {}) {
  const lang = ctx.lang === 'es' ? 'es' : 'en';
  const es = lang === 'es';
  const t = T[lang];
  const c = ctx.findings && ctx.findings.cost || {};
  const r = ctx.findings && ctx.findings.risk || {};
  const d = ctx.findings && ctx.findings.data || {};
  const sc = ctx.scorecard || {};
  const eng = ctx.engagement || {};

  const p1c = (c.phases && c.phases.phase_1) || {};
  const p2c = (c.phases && c.phases.phase_2) || {};
  const pilot = r.pilot || {};
  const weeks = pilot.duration_weeks || 4;

  const fmt = cost.fmt;
  const bandStr = (b) => b && b.low ? `${fmt(b.low)} – ${fmt(b.high)}` : (es ? 'por definir' : 'to be defined');

  /* ── Phase 1 ──────────────────────────────────────────────────────────── */
  const phase1 = {
    number: 1,
    title: t.p1,
    objective: es
      ? 'Quitar horas medibles de un proceso interno, con una persona revisando cada salida, y obtener una tasa de error real sobre sus propios casos.'
      : 'Remove measurable hours from one internal process, with a person reviewing every output, and get a real error rate on your own cases.',
    scope: (c.pilot_scope || []).map(p => p.name),
    out_of_scope: (c.excluded_from_pilot || []).map(p => ({ name: p.name, why: (p.blockers || []).join('; ') })),
    timeline_weeks: weeks,
    timeline_detail: buildTimeline(weeks, pilot.shadow_period_weeks || 0, lang),
    cost: {
      build_usd_range: bandStr(p1c.build_usd),
      run_monthly_usd: p1c.run_monthly_usd || null,
      max_exposure_usd: p1c.max_exposure_usd || null,
      max_exposure_note: es
        ? 'Lo máximo que puede perder si no devuelve nada y se detiene en la primera compuerta.'
        : 'The most you can lose if it returns nothing and is stopped at the first gate.'
    },
    risk_level: 'low',
    risk_level_why: es
      ? 'Interno, sin datos regulados, ningún cliente lo ve, una persona revisa todo, y se apaga en la misma tarde.'
      : 'Internal, no regulated data, no customer sees it, a person reviews everything, and it switches off the same afternoon.',
    data_requirements: (d.remediation || []).filter(x => x.blocks_phase_1).map(x => x.fix),
    data_requirements_note: (d.blocking_count || 0) === 0
      ? (es ? 'Nada del lado de los datos impide empezar.' : 'Nothing on the data side prevents starting.')
      : (es ? 'Estos deben resolverse primero. Se miden en días.' : 'These must be cleared first. They are measured in days.'),
    success_metrics: pilot.success_criteria || [],
    guardrails: (r.register || []).map(x => x.guardrail),
    exit_criteria: pilot.exit_criteria || [],
    what_you_keep_if_it_fails: pilot.what_you_keep_if_it_fails || [],
    gate: {
      title: t.gate,
      conditions: es ? [
        'Se retiraron horas medibles, verificadas por quienes hacen el trabajo.',
        'La precisión sobre sus casos reales alcanzó el umbral fijado al inicio.',
        'Los operadores dijeron que lo conservarían.',
        'No apareció ningún dato regulado fuera del alcance acordado.'
      ] : [
        'Measurable hours were removed, verified by the people doing the work.',
        'Accuracy on your real cases met the threshold set at kickoff.',
        'The operators said they would keep it.',
        'No regulated data appeared outside the agreed scope.'
      ],
      if_not_met: es
        ? 'La Fase 2 no se financia. El costo del piloto queda como el costo total, y usted conserva todo lo producido.'
        : 'Phase 2 is not funded. The pilot cost stands as the total cost, and you keep everything produced.'
    }
  };

  /* ── Phase 2 ──────────────────────────────────────────────────────────── */
  const phase2 = {
    number: 2,
    title: t.p2,
    conditional: true,
    condition: es
      ? 'Solo ocurre si la Fase 1 pasó su compuerta. No se dispara automáticamente.'
      : 'Only happens if Phase 1 passed its gate. It is not automatically triggered.',
    objective: es
      ? 'Repetir el patrón probado en los procesos que quedaron fuera, y relajar la revisión humana solo en las rutas donde la evidencia lo justifica.'
      : 'Repeat the proven pattern across the processes that were held out, and relax human review only on the paths where the evidence supports it.',
    scope: (c.excluded_from_pilot || []).map(p => p.name),
    timeline_weeks: Math.max(8, weeks * 2),
    cost: {
      build_usd_range: bandStr(p2c.build_usd),
      run_monthly_usd: p2c.run_monthly_usd || null,
      projected_annual_savings_usd: p2c.projected_annual_savings_usd || null,
      capture_rate_applied: p2c.capture_rate_applied || null,
      note: es
        ? 'Cifra indicativa a los mismos supuestos declarados. Se recalcula con los datos reales de la Fase 1 antes de comprometerse.'
        : 'Indicative, on the same stated assumptions. Recalculated from Phase 1\'s actual figures before anything is committed.'
    },
    risk_level: 'medium',
    risk_level_why: es
      ? 'Entra trabajo regulado o de cara al cliente, pero solo después de que las salvaguardas se demostraron en algo más seguro.'
      : 'Regulated or customer-facing work comes in, but only after the guardrails were demonstrated on something safer.',
    data_requirements: (d.remediation || []).filter(x => !x.blocks_phase_1).map(x => x.fix),
    regulatory_prerequisites: (r.regulatory_obligations || []).flatMap(o => o.requires.map(q => `${o.regime}: ${q}`)),
    success_metrics: es ? [
      { metric: 'Horas retiradas en todos los procesos del alcance', how_measured: 'Igual que en la Fase 1: medidas por quienes hacen el trabajo.' },
      { metric: 'Tasa de error estable o a la baja al ampliar el alcance', how_measured: 'El mismo conjunto de evaluación, ampliado.' },
      { metric: 'Ningún incidente de datos fuera del alcance acordado', how_measured: 'Registro de acceso, revisado en la compuerta.' }
    ] : [
      { metric: 'Hours removed across all in-scope processes', how_measured: 'Same as Phase 1: measured by the people doing the work.' },
      { metric: 'Error rate flat or falling as scope widens', how_measured: 'The same evaluation set, extended.' },
      { metric: 'No data incident outside the agreed scope', how_measured: 'Access log, reviewed at the gate.' }
    ],
    gate: {
      title: t.gate,
      conditions: es ? [
        'Los ahorros medidos alcanzaron o superaron lo proyectado para la Fase 1.',
        'La tasa de error no subió al ampliar el alcance.',
        'Existe un responsable nombrado de la calidad de los datos.'
      ] : [
        'Measured savings met or beat the Phase 1 projection.',
        'The error rate did not rise as scope widened.',
        'A named owner for data quality exists.'
      ],
      if_not_met: es ? 'Se detiene en la Fase 2. Sigue siendo un buen resultado.' : 'Stop at Phase 2. That is still a good outcome.'
    }
  };

  /* ── Phase 3 ──────────────────────────────────────────────────────────── */
  const phase3 = {
    number: 3,
    title: t.p3,
    conditional: true,
    condition: es ? 'Depende por completo de la evidencia de la Fase 2.' : 'Entirely dependent on Phase 2 evidence.',
    objective: es
      ? 'Rediseñar cómo se hace el trabajo, en lugar de automatizar cómo se hace hoy. Esta es la fase que cambia el negocio, y la única honesta de emprender con evidencia en la mano.'
      : 'Redesign how the work is done, rather than automating how it is done today. This is the phase that changes the business, and the only honest one to attempt with evidence in hand.',
    directions: es ? [
      'Los procesos se rediseñan alrededor de lo que la IA demostró hacer bien, no al revés.',
      'Se relaja la revisión humana donde la tasa de error medida lo respalda, y se mantiene donde no.',
      'Los procesos de cara al cliente entran al final, no al principio.'
    ] : [
      'Processes are redesigned around what the AI demonstrably does well, rather than the other way round.',
      'Human review is relaxed where the measured error rate supports it, and kept where it does not.',
      'Customer-facing processes come in last, not first.'
    ],
    cost: {
      costed: false,
      why_not_costed: (c.phases && c.phases.phase_3 && c.phases.phase_3.why_not_costed) ||
        (es ? 'No se cotiza aquí: hacerlo produciría una cifra inventada.' : 'Not priced here: doing so would produce a fabricated figure.')
    },
    risk_level: 'managed',
    risk_level_why: es
      ? 'El riesgo en esta fase se gestiona con datos de dos fases de operación real, no con supuestos.'
      : 'Risk in this phase is managed with data from two phases of real operation, not with assumptions.',
    preconditions: es ? [
      'Las Fases 1 y 2 cumplieron sus compuertas.',
      'Existe una tasa de error medida por proceso.',
      'Los acuerdos de tratamiento de datos cubren todo lo que entra en alcance.',
      'Su intención sobre el personal está declarada y se ha sostenido.'
    ] : [
      'Phases 1 and 2 met their gates.',
      'A measured error rate exists per process.',
      'Processing agreements cover everything coming into scope.',
      'Your headcount intent is stated and has been honored.'
    ]
  };

  /* ── executive summary (deterministic fallback prose) ─────────────────── */
  const summary = deterministicSummary({ eng, c, r, d, sc, phase1, lang });

  return {
    phases: [phase1, phase2, phase3],
    executive_summary: summary,
    talk_track: talkTrack({ eng, c, r, d, sc, phase1, lang }),
    assumptions: c.assumptions || [],
    honesty_notes: es ? [
      'Cada cifra en dólares proviene de las horas, el personal y las tarifas que usted nos dio. No usamos promedios de la industria para calcular sus ahorros.',
      'Los supuestos que sí usamos están listados con su base al final de este documento.',
      'La Fase 3 no está cotizada a propósito.',
      'Las métricas de éxito declaran lo que se medirá; no prometen un resultado.'
    ] : [
      'Every dollar figure comes from the hours, headcount and rates you gave us. We do not use industry averages for your savings.',
      'The assumptions we do use are listed with their basis at the end of this document.',
      'Phase 3 is deliberately not priced.',
      'Success metrics state what will be measured; they do not promise an outcome.'
    ]
  };
}

function buildTimeline(weeks, shadowWeeks, lang) {
  const es = lang === 'es';
  const out = [];
  out.push({ week: 1, label: es ? 'Alcance y acceso' : 'Scope and access',
    detail: es ? 'Aprobar la lista de campos, confirmar la ruta de exportación, construir el conjunto de evaluación con casos pasados reales.'
               : 'Approve the field list, confirm the export path, build the evaluation set from real past cases.' });
  out.push({ week: 2, label: es ? 'Construir y medir' : 'Build and measure',
    detail: es ? 'Primera versión funcionando contra el conjunto de evaluación. La precisión se reporta antes de que toque trabajo real.'
               : 'First working version against the evaluation set. Accuracy is reported before it touches live work.' });
  if (shadowWeeks > 0) {
    out.push({ week: 3, label: es ? 'Modo sombra' : 'Shadow mode',
      detail: es ? 'Corre junto a las personas. Nada de lo que produce se ejecuta. Se comparan las respuestas.'
                 : 'Runs alongside the people. Nothing it produces is acted on. Answers are compared.' });
  }
  for (let w = out.length + 1; w < weeks; w++) {
    out.push({ week: w, label: es ? 'Uso supervisado' : 'Supervised use',
      detail: es ? 'La IA redacta, una persona envía. Se miden horas y retrabajo semanalmente.'
                 : 'The AI drafts, a person sends. Hours and rework measured weekly.' });
  }
  out.push({ week: weeks, label: es ? 'Compuerta' : 'Gate',
    detail: es ? 'Horas retiradas, precisión, retrabajo y el veredicto de los operadores, en una página. Decisión de seguir o parar.'
               : 'Hours removed, accuracy, rework and the operators\' verdict, on one page. Continue or stop.' });
  return out;
}

function deterministicSummary({ eng, c, r, d, sc, phase1, lang }) {
  const es = lang === 'es';
  const fmt = cost.fmt;
  const cdn = c.cost_of_doing_nothing || {};
  const p1 = (c.phases && c.phases.phase_1) || {};
  const company = eng.company_name || (es ? 'su empresa' : 'your company');
  const parts = [];

  if (cdn.total_annual_usd) {
    parts.push(es
      ? `${company} gasta hoy alrededor de ${fmt(cdn.total_annual_usd)} al año haciendo a mano el trabajo que nombró — calculado con sus propias horas y tarifas, no con promedios del sector.`
      : `${company} currently spends about ${fmt(cdn.total_annual_usd)} a year doing the work you named by hand — computed from your own hours and rates, not from sector averages.`);
  }
  if (p1.max_exposure_usd) {
    parts.push(es
      ? `La propuesta no es transformar la empresa. Es probar un proceso interno durante ${phase1.timeline_weeks} semanas con una exposición máxima de ${fmt(p1.max_exposure_usd)} — la cantidad total que puede perder si no funciona.`
      : `The proposal is not to transform the company. It is to prove one internal process over ${phase1.timeline_weeks} weeks with a maximum exposure of ${fmt(p1.max_exposure_usd)} — the total amount you can lose if it does not work.`);
  }
  if (r.pilot) {
    parts.push(es
      ? 'Una persona revisa cada salida, ningún cliente lo ve, cuatro condiciones escritas lo detienen sin reunión, y apagarlo devuelve la operación exactamente a como trabaja hoy.'
      : 'A person reviews every output, no customer sees it, four written conditions stop it without a meeting, and switching it off returns you to exactly how you work today.');
  }
  if (d.headline) parts.push(d.headline);
  if (sc.verdict_label) parts.push(sc.verdict_label);

  return parts.join(' ');
}

/**
 * THE TALK TRACK — what the sponsor says out loud.
 *
 * The department is presented by a person, and the presentation is where it
 * succeeds or fails. A sponsor holding a beautiful document they cannot
 * narrate will read the slides aloud, which is the one delivery guaranteed
 * not to move a frightened CEO.
 */
function talkTrack({ eng, c, r, d, sc, phase1, lang }) {
  const es = lang === 'es';
  const fmt = cost.fmt;
  const cdn = c.cost_of_doing_nothing || {};
  const p1 = (c.phases && c.phases.phase_1) || {};
  const fear = (eng.biggest_fear || '').toString();

  const track = [];

  track.push({
    section: es ? 'Apertura' : 'Opening',
    say: es
      ? 'Antes de mostrarle nada, quiero decir qué NO es esto. No es una propuesta de transformación, y no le voy a pedir que crea una proyección. Todo número aquí sale de lo que usted me dijo.'
      : 'Before I show you anything, I want to say what this is not. It is not a transformation proposal, and I am not going to ask you to believe a projection. Every number in here came from what you told me.',
    watch_for: es ? 'Si se relaja aquí, el resto de la conversación es técnica en vez de defensiva.' : 'If they relax here, the rest of the conversation is technical rather than defensive.'
  });

  if (fear) {
    track.push({
      section: es ? 'Su bloqueo declarado' : 'Their stated blocker',
      say: es
        ? `Usted me dijo que lo que realmente lo frena es ${fearLabel(fear, 'es')}. Empecemos por ahí, no por la tecnología.`
        : `You told me the real thing holding you back is ${fearLabel(fear, 'en')}. Let us start there, not with the technology.`,
      watch_for: es ? 'Repetirle su propio bloqueo textualmente es lo que separa esto de un pitch.' : 'Repeating their own blocker back verbatim is what separates this from a pitch.'
    });
  }

  if (cdn.total_annual_usd) {
    track.push({
      section: es ? 'El costo de no hacer nada' : 'The cost of doing nothing',
      say: es
        ? `Con sus horas y sus tarifas: ${fmt(cdn.total_annual_usd)} al año. No estoy diciendo que vaya a ahorrar todo eso. Estoy diciendo que ese es el gasto contra el que compara.`
        : `On your hours and your rates: ${fmt(cdn.total_annual_usd)} a year. I am not saying you will save all of that. I am saying that is the spend you are comparing against.`,
      watch_for: es ? 'Si discute la cifra, es buena señal: son sus números, corríjalos en vivo.' : 'If they argue with the figure, that is good: they are their numbers, correct them live.'
    });
  }

  track.push({
    section: es ? 'La exposición máxima' : 'The maximum exposure',
    say: es
      ? `Lo máximo que puede perder es ${fmt(p1.max_exposure_usd)}. No es un rango que se expande. Es el total si no devuelve nada y lo detenemos en la primera compuerta.`
      : `The most you can lose is ${fmt(p1.max_exposure_usd)}. That is not a range that expands. It is the total if it returns nothing and we stop it at the first gate.`,
    watch_for: es ? 'Esta suele ser la frase que cambia la postura del CEO. Haga una pausa después.' : 'This is usually the sentence that changes the CEO\'s posture. Pause after it.'
  });

  track.push({
    section: es ? 'Cómo termina si es malo' : 'How it ends if it is bad',
    say: es
      ? 'Cuatro condiciones escritas lo detienen, y una persona que usted nombra puede pararlo sin reunión. Apagarlo lo devuelve exactamente a como trabaja hoy, la misma tarde.'
      : 'Four written conditions stop it, and one person you name can halt it without a meeting. Switching it off returns you to exactly how you work today, the same afternoon.',
    watch_for: es ? 'Casi nadie les ofrece los criterios de salida por adelantado. Dígalo despacio.' : 'Almost nobody offers them the exit criteria up front. Say it slowly.'
  });

  track.push({
    section: es ? 'El tablero' : 'The scorecard',
    say: es
      ? 'Tres carriles: costo, riesgo y datos. Le voy a mostrar los rojos primero, porque si le muestro solo los verdes usted deja de creerme.'
      : 'Three lanes: cost, risk and data. I am going to show you the reds first, because if I only show you the greens you stop believing me.',
    watch_for: es ? 'Presentar el rojo primero es deliberado. Compra credibilidad para el verde.' : 'Leading with red is deliberate. It buys credibility for the green.'
  });

  if (d.headline) {
    track.push({
      section: es ? 'Los datos' : 'The data',
      say: es
        ? `${d.headline} Y lo que casi todos hacen mal aquí: financiar un proyecto de datos de dieciocho meses en vez del piloto de cuatro semanas. El primer proceso necesita una rebanada estrecha, no todo.`
        : `${d.headline} And the mistake almost everybody makes here: funding an eighteen-month data project instead of the four-week pilot. The first process needs a narrow slice, not everything.`,
      watch_for: es ? 'El "nuestros datos son un desorden" es casi siempre cierto y casi nunca es la razón para esperar.' : '"Our data is a mess" is almost always true and almost never the reason to wait.'
    });
  }

  track.push({
    section: es ? 'El siguiente paso' : 'The next step',
    say: es
      ? `${(sc.safe_next_step && sc.safe_next_step.step) || ''} ${(sc.safe_next_step && sc.safe_next_step.commitment) || ''}`
      : `${(sc.safe_next_step && sc.safe_next_step.step) || ''} ${(sc.safe_next_step && sc.safe_next_step.commitment) || ''}`,
    watch_for: es ? 'Pida la decisión aquí. Es lo bastante pequeña para decidirla en la sala.' : 'Ask for the decision here. It is small enough to make in the room.'
  });

  /* ── the objections that actually get raised ──────────────────────────── */
  track.push({
    section: es ? 'Objeciones — respuestas preparadas' : 'Objections — prepared answers',
    objections: es ? [
      { they_say: '¿Y si la IA se equivoca?', you_say: 'En la Fase 1 la IA redacta y una persona envía. No existe la ruta por la que algo llegue a un cliente sin revisión. Y le damos la tasa de error medida sobre sus casos reales antes de que toque trabajo en vivo.' },
      { they_say: 'Nuestros datos son un desorden.', you_say: 'Sí. Y el primer proceso necesita una rebanada estrecha. Le mostré exactamente qué bloquea y qué no; lo que bloquea se mide en días.' },
      { they_say: 'Ya me vendieron esto antes.', you_say: 'Por eso la Fase 3 no está cotizada aquí. Cotizarla habría producido una cifra inventada, y esa cifra es la que enseña a desconfiar de estos documentos.' },
      { they_say: '¿Qué pasa con mi gente?', you_say: 'Su intención sobre el personal está escrita en el documento y se muestra al equipo. Si no se declara, cada empleado asume la peor versión.' },
      { they_say: 'Es demasiado dinero para un experimento.', you_say: 'Se puede estrechar a un solo proceso. Le puedo mostrar esa cifra ahora mismo — está en la ruta de presupuesto.' }
    ] : [
      { they_say: 'What if the AI gets it wrong?', you_say: 'In Phase 1 the AI drafts and a person sends. There is no path by which something reaches a customer unreviewed. And you get the measured error rate on your own real cases before it touches live work.' },
      { they_say: 'Our data is a mess.', you_say: 'It is. And the first process needs a narrow slice. I showed you exactly what blocks and what does not; what blocks is measured in days.' },
      { they_say: 'I have been sold this before.', you_say: 'That is why Phase 3 is not priced in here. Pricing it would have produced a fabricated number, and that number is what teaches people to distrust these documents.' },
      { they_say: 'What about my people?', you_say: 'Your headcount intent is written into the document and shown to staff. Left unstated, every employee assumes the worst version.' },
      { they_say: 'That is a lot of money for an experiment.', you_say: 'It can narrow to a single process. I can show you that figure right now — it is in the budget path.' }
    ]
  });

  return track;
}

function fearLabel(k, lang) {
  const m = {
    en: { cost: 'the cost', risk: 'the risk of owning a failure', data: 'the state of your data',
          job_disruption: 'the effect on your people', vendor_lockin: 'getting locked into a vendor',
          dont_know_where_to_start: 'not knowing where to start', been_oversold_before: 'having been oversold this before',
          reputation: 'a public mistake in front of customers' },
    es: { cost: 'el costo', risk: 'el riesgo de cargar con un fracaso', data: 'el estado de sus datos',
          job_disruption: 'el efecto sobre su gente', vendor_lockin: 'quedar atado a un proveedor',
          dont_know_where_to_start: 'no saber por dónde empezar', been_oversold_before: 'que ya se lo vendieron antes',
          reputation: 'un error público frente a clientes' }
  };
  return (m[lang] && m[lang][k]) || k;
}

module.exports = { build, buildTimeline, talkTrack };
