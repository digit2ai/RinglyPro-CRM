'use strict';

/**
 * RISK COMFORT ENGINE — the Risk Comfort Agent's register.
 *
 * The fear this answers: "something will go wrong and I will be the one who
 * signed off on it."
 *
 * The distinction that does the work here is MITIGATION versus GUARDRAIL:
 *
 *   A mitigation is what we do to make a bad outcome less likely.
 *   A guardrail is what makes it structurally unavailable.
 *
 * "We will be careful with regulated data" is a mitigation. "Regulated data is
 * out of Phase 1 scope entirely, so there is no path by which it reaches a
 * model" is a guardrail. Only the second one survives a board asking what
 * happens when someone makes a mistake. Every entry in this catalog therefore
 * carries both, and the guardrail is always a structural statement — a thing
 * removed, gated or made impossible, never a promise to try harder.
 *
 * Every risk also carries an OWNER and EVIDENCE_OF_CONTROL. A risk with a
 * mitigation but no named owner is not managed, and a CEO knows it.
 *
 * Deterministic. No model writes any part of this register.
 */

/* ── the catalog ─────────────────────────────────────────────────────────── */
const CATALOG = {
  security: {
    label: { en: 'Our data leaking out', es: 'Que se filtren nuestros datos' },
    inherent_severity: 5,
    mitigation: {
      en: 'Data is processed under a no-training agreement, encrypted in transit and at rest, and scoped per tenant so one company\'s records are not reachable from another\'s session.',
      es: 'Los datos se procesan bajo un acuerdo de no-entrenamiento, cifrados en tránsito y en reposo, y aislados por tenant, de modo que los registros de una empresa no son alcanzables desde la sesión de otra.'
    },
    guardrail: {
      en: 'The pilot runs against a defined, listed set of fields. Anything not on that list is never sent — not filtered afterwards, never sent. The list is signed off before a line of code runs.',
      es: 'El piloto opera sobre un conjunto de campos definido y listado. Lo que no esté en esa lista nunca se envía — no se filtra después, no se envía. La lista se aprueba antes de escribir una línea de código.'
    },
    owner: { en: 'Your IT or security lead, jointly with the delivery team', es: 'Su responsable de TI o seguridad, junto con el equipo de entrega' },
    evidence: { en: 'A one-page data-flow diagram listing every field that leaves your systems, approved before build starts.', es: 'Un diagrama de flujo de datos de una página que lista cada campo que sale de sus sistemas, aprobado antes de iniciar el desarrollo.' },
    residual_severity: 2
  },

  compliance: {
    label: { en: 'Breaking a regulation', es: 'Incumplir una regulación' },
    inherent_severity: 5,
    mitigation: {
      en: 'Regulated categories are identified during intake and handled under the regime that governs them, with processing agreements in place before any data moves.',
      es: 'Las categorías reguladas se identifican en la toma de requisitos y se tratan bajo el régimen que las gobierna, con acuerdos de tratamiento firmados antes de mover cualquier dato.'
    },
    guardrail: {
      en: 'Processes that touch regulated data are excluded from Phase 1 by scope, not by policy. They return in Phase 2 only after the controls have been demonstrated on non-regulated work.',
      es: 'Los procesos que tocan datos regulados quedan fuera de la Fase 1 por alcance, no por política. Regresan en la Fase 2 solo después de demostrar los controles en trabajo no regulado.'
    },
    owner: { en: 'Your compliance officer or external counsel', es: 'Su oficial de cumplimiento o asesoría legal externa' },
    evidence: { en: 'Signed processing agreements, and a written scope statement naming what Phase 1 does not touch.', es: 'Acuerdos de tratamiento firmados y una declaración de alcance escrita que nombre lo que la Fase 1 no toca.' },
    residual_severity: 2
  },

  errors: {
    label: { en: 'The AI being confidently wrong', es: 'Que la IA se equivoque con seguridad' },
    inherent_severity: 4,
    mitigation: {
      en: 'The system is measured against a fixed set of real cases with known correct answers before it goes anywhere near live work, and it is required to say it does not know rather than to guess.',
      es: 'El sistema se mide contra un conjunto fijo de casos reales con respuestas correctas conocidas antes de acercarse al trabajo real, y está obligado a decir que no sabe en lugar de adivinar.'
    },
    guardrail: {
      en: 'In Phase 1 the AI drafts and a person sends. There is no configuration in which output reaches a customer without a human having seen it — the send path does not exist.',
      es: 'En la Fase 1 la IA redacta y una persona envía. No existe configuración en la que la salida llegue a un cliente sin que una persona la haya visto — la ruta de envío no existe.'
    },
    owner: { en: 'The process owner who reviews the output today', es: 'El responsable del proceso que hoy revisa la salida' },
    evidence: { en: 'A published accuracy figure on your own cases, not a vendor benchmark.', es: 'Una cifra de precisión publicada sobre sus propios casos, no un benchmark del proveedor.' },
    residual_severity: 2
  },

  reputation: {
    label: { en: 'Embarrassing us in front of a customer', es: 'Quedar mal frente a un cliente' },
    inherent_severity: 4,
    mitigation: {
      en: 'Phase 1 is chosen from internal, back-office work. A customer never encounters the pilot.',
      es: 'La Fase 1 se elige de trabajo interno, de back-office. Un cliente nunca se encuentra con el piloto.'
    },
    guardrail: {
      en: 'Customer-facing processes are ineligible for Phase 1 by rule. If the pilot fails, the only people who see it are the ones in the room.',
      es: 'Los procesos de cara al cliente son inelegibles para la Fase 1 por regla. Si el piloto falla, los únicos que lo ven son los que están en la sala.'
    },
    owner: { en: 'You, with your marketing or customer lead', es: 'Usted, con su responsable de marketing o de clientes' },
    evidence: { en: 'The Phase 1 scope statement, which lists zero customer touchpoints.', es: 'La declaración de alcance de la Fase 1, que lista cero puntos de contacto con clientes.' },
    residual_severity: 1
  },

  job_disruption: {
    label: { en: 'Damaging morale or losing people', es: 'Dañar el clima laboral o perder gente' },
    inherent_severity: 4,
    mitigation: {
      en: 'The pilot targets the part of a job people already describe as the worst part of it, and the people doing that work are the ones who review the output — which makes them the operators, not the displaced.',
      es: 'El piloto apunta a la parte del trabajo que la gente ya describe como la peor, y quienes hacen ese trabajo son quienes revisan la salida — lo que los convierte en operadores, no en desplazados.'
    },
    guardrail: {
      en: 'Your stated intent on headcount is written into the roadmap and shown to staff. No reduction is tied to the pilot. An unstated intent is assumed by every employee to be the worst one.',
      es: 'Su intención declarada sobre el personal queda escrita en la hoja de ruta y se muestra al equipo. Ninguna reducción se vincula al piloto. Una intención no declarada es asumida por cada empleado como la peor posible.'
    },
    owner: { en: 'You. This one cannot be delegated.', es: 'Usted. Esta no se puede delegar.' },
    evidence: { en: 'A written, circulated statement of intent before the pilot is announced.', es: 'Una declaración de intención escrita y circulada antes de anunciar el piloto.' },
    residual_severity: 2
  },

  vendor_lockin: {
    label: { en: 'Not being able to leave', es: 'No poder salirnos' },
    inherent_severity: 3,
    mitigation: {
      en: 'Your data stays in your systems as the record of truth. The AI layer reads from them; it does not become the place your business lives.',
      es: 'Sus datos permanecen en sus sistemas como registro de verdad. La capa de IA lee de ellos; no se convierte en el lugar donde vive su negocio.'
    },
    guardrail: {
      en: 'Everything produced during the pilot — prompts, evaluation sets, process documentation, extracted data — is yours in an open format, handed over on request, including if you cancel. A pilot you cannot walk away from was not a pilot.',
      es: 'Todo lo producido durante el piloto — prompts, conjuntos de evaluación, documentación de procesos, datos extraídos — es suyo en formato abierto, entregable a solicitud, incluso si cancela. Un piloto del que no puede salir no era un piloto.'
    },
    owner: { en: 'Your operations lead', es: 'Su responsable de operaciones' },
    evidence: { en: 'An exit clause in the engagement terms naming the artifacts and the format.', es: 'Una cláusula de salida en los términos que nombre los artefactos y el formato.' },
    residual_severity: 1
  },

  ip_leakage: {
    label: { en: 'Our know-how training someone else\'s model', es: 'Que nuestro conocimiento entrene el modelo de otro' },
    inherent_severity: 4,
    mitigation: {
      en: 'Processing runs under terms that prohibit training on your content, and retention is set to the shortest window the workload allows.',
      es: 'El procesamiento opera bajo términos que prohíben el entrenamiento con su contenido, y la retención se fija a la ventana más corta que el flujo permita.'
    },
    guardrail: {
      en: 'The no-training term is a contract clause you hold, not a setting in a dashboard someone can toggle.',
      es: 'La cláusula de no-entrenamiento es un término contractual en su poder, no una casilla en un panel que alguien pueda cambiar.'
    },
    owner: { en: 'Whoever signs your vendor contracts', es: 'Quien firma sus contratos con proveedores' },
    evidence: { en: 'The clause itself, in the executed agreement.', es: 'La cláusula misma, en el acuerdo firmado.' },
    residual_severity: 2
  },

  bad_decisions: {
    label: { en: 'Someone acting on a wrong answer', es: 'Que alguien actúe sobre una respuesta equivocada' },
    inherent_severity: 5,
    mitigation: {
      en: 'Output carries its source. An answer that cannot point at the record it came from is presented as unsupported rather than as an answer.',
      es: 'La salida lleva su fuente. Una respuesta que no puede señalar el registro del que proviene se presenta como no sustentada, no como una respuesta.'
    },
    guardrail: {
      en: 'For the first weeks the system runs in shadow: it produces its answer alongside the human\'s, the two are compared, and nothing it produces is acted on. You see its error rate on your own work before it has any authority at all.',
      es: 'Durante las primeras semanas el sistema corre en sombra: produce su respuesta junto a la de la persona, se comparan, y nada de lo que produce se ejecuta. Usted ve su tasa de error sobre su propio trabajo antes de que tenga autoridad alguna.'
    },
    owner: { en: 'The process owner', es: 'El responsable del proceso' },
    evidence: { en: 'The shadow-mode comparison log, reviewed at the Phase 1 gate.', es: 'El registro comparativo del modo sombra, revisado en la compuerta de la Fase 1.' },
    residual_severity: 2
  }
};

/* ── regulatory overlays ─────────────────────────────────────────────────── */
// Named obligations, not legal advice — and the deliverable says so.
const REGIMES = {
  hipaa: { name: 'HIPAA', requires: ['A signed BAA with every processor', 'PHI excluded from Phase 1 scope', 'Access logging retained'] },
  gdpr: { name: 'GDPR', requires: ['A DPA with every processor', 'A lawful basis recorded per processing purpose', 'Data-subject deletion path that reaches the AI layer'] },
  ccpa: { name: 'CCPA/CPRA', requires: ['Disclosure of processing purposes', 'Opt-out honored downstream of the AI layer'] },
  pci: { name: 'PCI DSS', requires: ['Cardholder data never enters the AI layer', 'Scope segmentation documented'] },
  sox: { name: 'SOX', requires: ['Change control over anything touching financial reporting', 'Audit trail on automated entries'] },
  ferpa: { name: 'FERPA', requires: ['Student records excluded from Phase 1', 'School-official designation documented'] },
  glba: { name: 'GLBA', requires: ['Safeguards Rule controls applied to the AI layer', 'Vendor oversight documented'] },
  local_data_residency: { name: 'Data residency', requires: ['Processing region pinned and verified', 'Cross-border transfer basis documented'] },
  industry_specific: { name: 'Industry-specific rules', requires: ['Named by your counsel during intake, then scoped out of Phase 1 until controls are proven'] }
};

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/**
 * Build the risk register and the low-risk pilot definition.
 *
 * @param {object} input
 *   risk_concerns[]        — what the CEO named
 *   regulatory_regimes[]
 *   worst_case             — quoted verbatim, never paraphrased
 *   workforce_sensitivity
 *   headcount_intent
 *   political_cost_of_failure
 *   security_review_required
 *   pilot_scope[]          — from the cost engine
 *   excluded_from_pilot[]
 *   lang
 */
function analyze(input = {}, lang = 'en') {
  const L = (o) => (o && (o[lang] || o.en)) || '';
  const concerns = Array.isArray(input.risk_concerns) ? input.risk_concerns : [];
  const regimes = (Array.isArray(input.regulatory_regimes) ? input.regulatory_regimes : []).filter(r => r && r !== 'none');

  /* ── the register ─────────────────────────────────────────────────────── */
  const register = concerns.filter(c => CATALOG[c]).map(c => {
    const e = CATALOG[c];
    return {
      concern: c,
      label: L(e.label),
      inherent_severity: e.inherent_severity,
      mitigation: L(e.mitigation),
      guardrail: L(e.guardrail),
      owner: L(e.owner),
      evidence_of_control: L(e.evidence),
      residual_severity: e.residual_severity,
      severity_reduction: e.inherent_severity - e.residual_severity
    };
  });

  // A concern we were told about but have no catalog entry for is reported as
  // unaddressed rather than quietly dropped. Silence here reads as coverage.
  const unaddressed = concerns.filter(c => !CATALOG[c]);

  /* ── regulatory obligations ───────────────────────────────────────────── */
  const obligations = regimes.filter(r => REGIMES[r]).map(r => ({
    regime: REGIMES[r].name,
    requires: REGIMES[r].requires,
    phase_1_position: 'Data governed by this regime is out of Phase 1 scope. These obligations are what Phase 2 must satisfy before it comes in.'
  }));

  /* ── the low-risk pilot ───────────────────────────────────────────────── */
  const scope = Array.isArray(input.pilot_scope) ? input.pilot_scope : [];
  const internalOnly = input.political_cost_of_failure === 'high' || concerns.includes('reputation');
  const shadowMode = concerns.includes('bad_decisions') || concerns.includes('errors');
  const weeks = num(process.env.AIR_PILOT_WEEKS, 4);

  const pilot = {
    scope: scope.map(p => p.name),
    duration_weeks: weeks,
    posture: internalOnly ? 'internal_only' : 'internal_first',
    human_in_the_loop: true,
    shadow_period_weeks: shadowMode ? Math.min(2, weeks) : 0,
    reversibility: 'Nothing in Phase 1 replaces an existing system. Turning it off returns you to exactly how you work today, the same afternoon.',

    // Success criteria are measured, not felt.
    success_criteria: buildSuccessCriteria(scope, shadowMode),

    // The part CEOs actually want and rarely get: how this ends if it is bad.
    exit_criteria: [
      { trigger: 'Measured accuracy on your own cases falls below the threshold agreed at kickoff.', action: 'Stop at the gate. No further spend.' },
      { trigger: 'The people doing the work say it is making the job worse, in a review at week two.', action: 'Stop. Their assessment is decisive, not advisory.' },
      { trigger: 'Any regulated or personal data is found in scope that was not identified at intake.', action: 'Halt processing immediately, and the field list is rebuilt before anything resumes.' },
      { trigger: 'Hours removed at the end of the pilot are below the stated target.', action: 'Phase 2 is not funded. The pilot cost stands as the total cost.' }
    ],
    kill_switch: 'One person, named at kickoff, can stop the pilot without a meeting. That authority is written down before we start.',
    what_you_keep_if_it_fails: [
      'A documented, measured description of the process — which most companies do not have.',
      'A measured error rate on your own real cases.',
      'The evaluation set, which is reusable against any future vendor.',
      'Everything produced, in an open format.'
    ]
  };

  /* ── workforce commitment ─────────────────────────────────────────────── */
  const intent = input.headcount_intent || 'undecided';
  const workforce = {
    stated_intent: intent,
    statement: {
      no_reductions: 'No role is eliminated as a result of this pilot. Stated in writing, before it is announced.',
      redeploy: 'Time freed by this pilot is redeployed to named work, not removed from the payroll. The receiving work is named before the pilot starts.',
      attrition_only: 'Any change in headcount happens through normal attrition, not through this pilot. Stated in writing.',
      undecided: 'Intent is not yet stated. This is the single largest unmanaged risk in this engagement: staff will assume the worst version, and they will be right to, because nothing has told them otherwise.'
    }[intent],
    is_gap: intent === 'undecided',
    sensitivity: input.workforce_sensitivity || 'unknown',
    // A unionized workforce is a process fact, not a risk to be talked around.
    additional: input.workforce_sensitivity === 'unionized'
      ? 'A unionized workforce means the pilot scope is a consultation matter before it is a technical one. Sequence the conversation accordingly.'
      : null
  };

  /* ── scoring ──────────────────────────────────────────────────────────── */
  let score = 0;
  const reasons = [];

  // Coverage: named concerns that have a structural guardrail (0-40)
  if (concerns.length) {
    const covered = register.length;
    const pts = Math.round((covered / concerns.length) * 40);
    score += pts;
    reasons.push(`${covered} of ${concerns.length} concerns you named have a named guardrail, an owner and a piece of evidence attached.`);
    if (unaddressed.length) reasons.push(`${unaddressed.length} named concern(s) have no standard control and need a bespoke answer before Phase 1.`);
  } else {
    score += 20;
    reasons.push('No specific risk concerns were named. Scored neutrally: an unnamed risk is not a managed risk, it is an unexamined one.');
  }

  // Phase 1 is genuinely low-risk (0-30)
  let lowRiskPts = 0;
  const excluded = Array.isArray(input.excluded_from_pilot) ? input.excluded_from_pilot : [];
  if (scope.length) lowRiskPts += 10;
  if (excluded.length || !regimes.length) lowRiskPts += 10;   // regulated work is out, or there is none
  if (internalOnly) lowRiskPts += 5;
  if (shadowMode) lowRiskPts += 5;
  score += lowRiskPts;
  if (scope.length) {
    reasons.push(`Phase 1 is scoped to ${scope.length} internal process(es) with a person reviewing every output${shadowMode ? ', preceded by a shadow period in which nothing it produces is acted on' : ''}.`);
  } else {
    reasons.push('No process qualified for a low-risk Phase 1 — every candidate touches regulated data, a customer, or has zero error tolerance. That is the finding to resolve first.');
  }

  // Reversibility and exit are defined (0-15) — always satisfied by design,
  // and stated so the CEO sees it is structural rather than negotiated.
  score += 15;
  reasons.push('The pilot is reversible on the same day, and four written conditions stop it without a meeting.');

  // Workforce intent stated (0-15)
  if (!workforce.is_gap) {
    score += 15;
    reasons.push('Your intent on headcount is stated and goes into the document in writing.');
  } else {
    reasons.push('Your intent on headcount is not yet stated, which leaves the most damaging risk in this engagement unmanaged.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const rating = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';

  const to_green = [];
  if (workforce.is_gap) to_green.push('State your headcount intent, even if the answer is "undecided, and I will say so openly". Silence is the worst option available.');
  if (unaddressed.length) to_green.push(`Give the concerns without a standard control a bespoke guardrail: ${unaddressed.join(', ')}.`);
  if (!scope.length) to_green.push('Identify one internal, non-regulated process a customer never sees. Without one there is no safe first step, and inventing one would be dishonest.');
  if (input.security_review_required && !concerns.includes('security')) to_green.push('A security review is required but security was not named as a concern — align those before kickoff so the review does not become the surprise that stops the pilot.');

  return {
    lane: 'risk',
    score, rating,
    reasons, to_green,
    register,
    unaddressed_concerns: unaddressed,
    regulatory_obligations: obligations,
    regulatory_disclaimer: 'These are named obligations, not legal advice. Your counsel confirms them; this document does not replace that.',
    worst_case_verbatim: input.worst_case ? String(input.worst_case).slice(0, 2000) : null,
    pilot,
    workforce,
    computed_by: 'deterministic'
  };
}

/** Success criteria the CEO can verify without trusting anyone's judgment. */
function buildSuccessCriteria(scope, shadowMode) {
  const c = [
    { metric: 'Hours removed per week, in the pilot scope', how_measured: 'Timed before and after, by the people doing the work.', target: 'Agreed at kickoff, as a number, in writing.' },
    { metric: 'Accuracy on a fixed set of your own past cases', how_measured: 'The same evaluation set, run before launch and at the gate.', target: 'A threshold set at kickoff. Below it, the pilot stops.' },
    { metric: 'Rework rate', how_measured: 'Share of AI output the reviewer had to materially correct.', target: 'Falling week over week, or the pilot has not worked.' },
    { metric: 'The operators would keep it', how_measured: 'A direct question to the people using it, at week two and at the gate.', target: 'Yes. A no here stops the pilot regardless of the other numbers.' }
  ];
  if (shadowMode) {
    c.unshift({
      metric: 'Shadow-mode agreement with human decisions',
      how_measured: 'The system produces an answer beside the human\'s; the two are compared and nothing it produces is acted on.',
      target: 'Measured and reported before the system is given any authority at all.'
    });
  }
  return c;
}

module.exports = { analyze, CATALOG, REGIMES };
