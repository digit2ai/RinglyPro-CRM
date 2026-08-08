'use strict';

/**
 * THE INTERVIEW — the question bank the Readiness Director works from.
 *
 * This file is the department's entire factual intake. Nothing downstream may
 * assert anything about a company that did not come from an answer here or
 * from a constant explicitly labeled an assumption. That rule is what makes
 * the deliverable defensible in front of a CEO who will push back on numbers.
 *
 * The questions are deliberately ordered fear-first. A CEO who has just named
 * what frightens them answers the operational questions honestly; a CEO led
 * with a data-inventory questionnaire goes into procurement mode and the
 * engagement never reaches the actual objection.
 *
 * Bilingual EN/ES. Every question carries `why` — the sponsor reads it aloud
 * when the CEO asks why they are being asked, which happens constantly.
 */

const SECTIONS = [
  /* ── 1. context ──────────────────────────────────────────────────────── */
  {
    id: 'context',
    order: 1,
    title: { en: 'The company', es: 'La empresa' },
    intent: {
      en: 'Establish who we are advising. Nothing here is scored — it frames every number that follows.',
      es: 'Establecer a quién asesoramos. Nada de esto se puntúa: enmarca todas las cifras posteriores.'
    },
    questions: [
      { key: 'company_name', type: 'text', required: true,
        q: { en: 'Company name', es: 'Nombre de la empresa' } },
      { key: 'ceo_name', type: 'text',
        q: { en: 'Who are we walking through this?', es: '¿A quién acompañamos en este proceso?' } },
      { key: 'industry', type: 'text',
        q: { en: 'Industry', es: 'Sector' },
        why: { en: 'Regulated sectors change what Phase 1 is allowed to touch.',
               es: 'Los sectores regulados cambian lo que la Fase 1 puede tocar.' } },
      { key: 'country', type: 'text', q: { en: 'Country of operation', es: 'País de operación' } },
      { key: 'headcount', type: 'number',
        q: { en: 'Roughly how many people work here?', es: '¿Cuántas personas trabajan aquí, aproximadamente?' } },
      { key: 'revenue_band', type: 'select',
        options: ['under_1m', '1m_10m', '10m_50m', '50m_250m', 'over_250m', 'prefer_not_to_say'],
        q: { en: 'Revenue band', es: 'Rango de facturación' },
        why: { en: 'Used only to sanity-check that a pilot budget is proportionate. A precise figure is never required.',
               es: 'Solo se usa para verificar que el presupuesto piloto sea proporcional. Nunca se requiere una cifra exacta.' } }
    ]
  },

  /* ── 2. fears ────────────────────────────────────────────────────────── */
  {
    id: 'fears',
    order: 2,
    title: { en: 'What is actually holding you back', es: 'Qué lo está frenando realmente' },
    intent: {
      en: 'Name the objection out loud. An unnamed fear cannot be answered, and it is the thing that kills the deal three months later.',
      es: 'Nombrar la objeción en voz alta. Un miedo sin nombrar no se puede responder, y es lo que mata el proyecto tres meses después.'
    },
    questions: [
      { key: 'top_fears', type: 'multi', required: true,
        options: ['cost', 'risk', 'data', 'job_disruption', 'vendor_lockin', 'dont_know_where_to_start', 'been_oversold_before', 'reputation'],
        labels: {
          en: {
            cost: 'It will cost more than it returns',
            risk: 'Something will go wrong and I will own it',
            data: 'Our data is a mess',
            job_disruption: 'What it does to my people',
            vendor_lockin: 'Getting locked into a vendor',
            dont_know_where_to_start: 'I do not know where to start',
            been_oversold_before: 'I have been oversold this before',
            reputation: 'A public mistake in front of customers'
          },
          es: {
            cost: 'Costará más de lo que devuelve',
            risk: 'Algo saldrá mal y yo respondo',
            data: 'Nuestros datos son un desorden',
            job_disruption: 'El efecto sobre mi gente',
            vendor_lockin: 'Quedar atado a un proveedor',
            dont_know_where_to_start: 'No sé por dónde empezar',
            been_oversold_before: 'Ya me lo vendieron antes y no funcionó',
            reputation: 'Un error público frente a clientes'
          }
        },
        q: { en: 'Which of these is true for you? Pick every one that is.',
             es: '¿Cuáles de estos son ciertos para usted? Marque todos los que apliquen.' } },
      { key: 'biggest_fear', type: 'select', required: true,
        options: ['cost', 'risk', 'data', 'job_disruption', 'vendor_lockin', 'dont_know_where_to_start', 'been_oversold_before', 'reputation'],
        q: { en: 'Of those, which one is the real blocker?', es: 'De esos, ¿cuál es el bloqueo real?' },
        why: { en: 'The roadmap opens by answering this one, not by describing technology.',
               es: 'La hoja de ruta abre respondiendo a este, no describiendo tecnología.' } },
      { key: 'prior_attempt', type: 'select', options: ['none', 'tried_failed', 'tried_stalled', 'in_progress'],
        q: { en: 'Have you tried AI here before?', es: '¿Ya han intentado usar IA aquí antes?' } },
      { key: 'prior_attempt_note', type: 'textarea',
        q: { en: 'What happened?', es: '¿Qué ocurrió?' } },
      { key: 'board_pressure', type: 'select', options: ['none', 'curious', 'expecting_a_plan', 'demanding_results'],
        q: { en: 'What is the board or your investors asking for?', es: '¿Qué le está pidiendo la junta o sus inversionistas?' } }
    ]
  },

  /* ── 3. pain ─────────────────────────────────────────────────────────── */
  {
    id: 'pain',
    order: 3,
    title: { en: 'Where the work actually hurts', es: 'Dónde duele realmente el trabajo' },
    intent: {
      en: 'The single most important section. The cost of doing nothing, the pilot scope and the ROI are all computed from these numbers and no others.',
      es: 'La sección más importante. El costo de no hacer nada, el alcance del piloto y el ROI se calculan con estos números y ningún otro.'
    },
    questions: [
      { key: 'processes', type: 'process_list', required: true,
        q: { en: 'Name up to three repetitive processes that eat time every week.',
             es: 'Nombre hasta tres procesos repetitivos que consumen tiempo cada semana.' },
        why: { en: 'Every dollar figure in your roadmap is built from these three answers. We do not use industry averages for your savings.',
               es: 'Cada cifra en dólares de su hoja de ruta se construye con estas tres respuestas. No usamos promedios de la industria para calcular sus ahorros.' },
        fields: [
          { key: 'name', type: 'text', q: { en: 'What is the process?', es: '¿Cuál es el proceso?' } },
          { key: 'people', type: 'number', q: { en: 'How many people touch it?', es: '¿Cuántas personas lo tocan?' } },
          { key: 'hours_per_week', type: 'number', q: { en: 'Hours per week, per person', es: 'Horas por semana, por persona' } },
          { key: 'loaded_hourly_cost', type: 'number', q: { en: 'Loaded hourly cost of that person (USD)', es: 'Costo horario cargado de esa persona (USD)' } },
          { key: 'customer_facing', type: 'bool', q: { en: 'Does a customer see the output?', es: '¿El cliente ve el resultado?' } },
          { key: 'involves_regulated_data', type: 'bool', q: { en: 'Does it touch regulated or personal data?', es: '¿Toca datos regulados o personales?' } },
          { key: 'error_tolerance', type: 'select', options: ['high', 'medium', 'low', 'zero'],
            q: { en: 'How much does an error cost here?', es: '¿Cuánto cuesta un error aquí?' } }
        ] },
      { key: 'known_leak', type: 'textarea',
        q: { en: 'Is there a number you already know you are losing? Missed calls, late quotes, rework, churn.',
             es: '¿Hay una cifra que ya sabe que está perdiendo? Llamadas no atendidas, cotizaciones tardías, retrabajo, cancelaciones.' } },
      { key: 'known_leak_annual_usd', type: 'number',
        q: { en: 'If you can put an annual dollar figure on it, what is it?',
             es: 'Si puede ponerle una cifra anual en dólares, ¿cuál es?' },
        why: { en: 'Left blank, we simply omit it. We never estimate a loss on your behalf.',
               es: 'Si se deja en blanco, simplemente lo omitimos. Nunca estimamos una pérdida en su nombre.' } }
    ]
  },

  /* ── 4. cost posture ─────────────────────────────────────────────────── */
  {
    id: 'cost',
    order: 4,
    title: { en: 'What you can comfortably risk', es: 'Lo que puede arriesgar con comodidad' },
    intent: {
      en: 'Set the exposure ceiling. The pilot is then designed to fit under it, rather than the CEO being asked to stretch to fit the pilot.',
      es: 'Fijar el techo de exposición. El piloto se diseña para caber por debajo, en vez de pedirle al CEO que se estire para alcanzar el piloto.'
    },
    questions: [
      { key: 'comfortable_pilot_budget_usd', type: 'number', required: true,
        q: { en: 'What could you spend once, on a pilot, and not lose sleep if it returned nothing?',
             es: '¿Cuánto podría gastar una vez, en un piloto, sin perder el sueño si no devolviera nada?' },
        why: { en: 'This is the number the entire Phase 1 is built to fit inside. It is a ceiling, not a target.',
               es: 'Este es el número dentro del cual se construye toda la Fase 1. Es un techo, no una meta.' } },
      { key: 'monthly_run_comfort_usd', type: 'number',
        q: { en: 'And per month to keep it running?', es: '¿Y mensual para mantenerlo funcionando?' } },
      { key: 'current_software_spend_monthly_usd', type: 'number',
        q: { en: 'Roughly what do you spend on software per month today?', es: '¿Cuánto gasta en software al mes hoy, aproximadamente?' },
        why: { en: 'Framing: a pilot that costs less than tools you already pay for is a different conversation.',
               es: 'Contexto: un piloto que cuesta menos que herramientas que ya paga es otra conversación.' } },
      { key: 'political_cost_of_failure', type: 'select', options: ['low', 'medium', 'high'],
        q: { en: 'If the pilot visibly failed, how much would that cost you internally?',
             es: 'Si el piloto fracasara visiblemente, ¿cuánto le costaría eso internamente?' },
        why: { en: 'High political cost means Phase 1 runs internal-only, where a failure is invisible outside the room.',
               es: 'Un alto costo político significa que la Fase 1 corre solo internamente, donde un fracaso es invisible fuera de la sala.' } },
      { key: 'decision_process', type: 'select', options: ['ceo_alone', 'ceo_plus_one', 'committee', 'board_approval'],
        q: { en: 'Who has to say yes?', es: '¿Quién tiene que decir que sí?' } }
    ]
  },

  /* ── 5. risk posture ─────────────────────────────────────────────────── */
  {
    id: 'risk',
    order: 5,
    title: { en: 'What must not go wrong', es: 'Lo que no puede salir mal' },
    intent: {
      en: 'Turn a vague sense of danger into a named list. Each named item gets a mitigation and a guardrail; unnamed dread cannot be mitigated.',
      es: 'Convertir una sensación vaga de peligro en una lista concreta. Cada ítem nombrado recibe mitigación y salvaguarda; el temor sin nombre no se puede mitigar.'
    },
    questions: [
      { key: 'regulatory_regimes', type: 'multi',
        options: ['none', 'hipaa', 'gdpr', 'ccpa', 'pci', 'sox', 'ferpa', 'glba', 'local_data_residency', 'industry_specific'],
        q: { en: 'Which of these apply to you?', es: '¿Cuáles de estos le aplican?' } },
      { key: 'risk_concerns', type: 'multi', required: true,
        options: ['security', 'compliance', 'errors', 'reputation', 'job_disruption', 'vendor_lockin', 'ip_leakage', 'bad_decisions'],
        labels: {
          en: {
            security: 'Our data leaking out',
            compliance: 'Breaking a regulation',
            errors: 'The AI being confidently wrong',
            reputation: 'Embarrassing us in front of a customer',
            job_disruption: 'Damaging morale or losing people',
            vendor_lockin: 'Not being able to leave',
            ip_leakage: 'Our know-how training someone else\'s model',
            bad_decisions: 'Someone acting on a wrong answer'
          },
          es: {
            security: 'Que se filtren nuestros datos',
            compliance: 'Incumplir una regulación',
            errors: 'Que la IA se equivoque con seguridad',
            reputation: 'Quedar mal frente a un cliente',
            job_disruption: 'Dañar el clima laboral o perder gente',
            vendor_lockin: 'No poder salirnos',
            ip_leakage: 'Que nuestro conocimiento entrene el modelo de otro',
            bad_decisions: 'Que alguien actúe sobre una respuesta equivocada'
          }
        },
        q: { en: 'Which of these keep you up at night?', es: '¿Cuáles de estos le quitan el sueño?' } },
      { key: 'worst_case', type: 'textarea',
        q: { en: 'Describe the worst realistic outcome in your own words.',
             es: 'Describa el peor resultado realista en sus propias palabras.' },
        why: { en: 'Quoted verbatim in the roadmap next to the guardrail that prevents it. Paraphrasing a CEO\'s fear loses the engagement.',
               es: 'Se cita textualmente en la hoja de ruta junto a la salvaguarda que lo previene. Parafrasear el miedo de un CEO pierde la conversación.' } },
      { key: 'workforce_sensitivity', type: 'select', options: ['low', 'medium', 'high', 'unionized'],
        q: { en: 'How sensitive is your workforce to this topic?', es: '¿Qué tan sensible es su equipo a este tema?' } },
      { key: 'headcount_intent', type: 'select', options: ['no_reductions', 'redeploy', 'attrition_only', 'undecided'],
        q: { en: 'What is your actual intent on headcount?', es: '¿Cuál es su intención real respecto al personal?' },
        why: { en: 'The roadmap states this in writing. An unstated intent gets assumed to be the worst one by every employee in the building.',
               es: 'La hoja de ruta lo declara por escrito. Una intención no declarada la asume cada empleado como la peor posible.' } },
      { key: 'security_review_required', type: 'bool',
        q: { en: 'Does anything new have to pass a security review?', es: '¿Algo nuevo debe pasar una revisión de seguridad?' } }
    ]
  },

  /* ── 6. data posture ─────────────────────────────────────────────────── */
  {
    id: 'data',
    order: 6,
    title: { en: 'What state your data is in', es: 'En qué estado están sus datos' },
    intent: {
      en: 'Score readiness honestly. A red score is not a rejection — it is a costed remediation plan and a Phase 1 that routes around the gap.',
      es: 'Puntuar la preparación con honestidad. Un rojo no es un rechazo: es un plan de remediación con costo y una Fase 1 que rodea la brecha.'
    },
    questions: [
      { key: 'systems', type: 'multi',
        options: ['erp', 'crm', 'accounting', 'spreadsheets', 'email', 'paper', 'custom_db', 'saas_tools', 'data_warehouse'],
        q: { en: 'Where does the work actually live?', es: '¿Dónde vive realmente el trabajo?' } },
      { key: 'data_exists', type: 'scale_1_5', required: true,
        q: { en: 'Is the data for those processes even captured today?',
             es: '¿Los datos de esos procesos siquiera se capturan hoy?' } },
      { key: 'data_quality', type: 'scale_1_5', required: true,
        q: { en: 'If you pulled a report right now, would you trust it?',
             es: 'Si sacara un reporte ahora mismo, ¿confiaría en él?' } },
      { key: 'data_accessible', type: 'scale_1_5', required: true,
        q: { en: 'How hard is it to get data out of those systems?',
             es: '¿Qué tan difícil es sacar datos de esos sistemas?' },
        why: { en: 'Scored inverted: 5 means easy export or a real API.', es: 'Se puntúa invertido: 5 significa exportación fácil o una API real.' } },
      { key: 'data_structured', type: 'scale_1_5',
        q: { en: 'Is it structured, or is it PDFs, emails and notes?',
             es: '¿Está estructurado, o son PDFs, correos y notas?' } },
      { key: 'data_owner_exists', type: 'bool',
        q: { en: 'Is there one person who owns data quality?', es: '¿Hay una persona responsable de la calidad de los datos?' } },
      { key: 'history_months', type: 'number',
        q: { en: 'How many months of history do you have?', es: '¿Cuántos meses de histórico tienen?' } },
      { key: 'contains_pii', type: 'bool', required: true,
        q: { en: 'Does it contain personal, health or payment data?',
             es: '¿Contiene datos personales, de salud o de pago?' } },
      { key: 'dpa_in_place', type: 'bool',
        q: { en: 'Do you have data-processing agreements with your current vendors?',
             es: '¿Tienen acuerdos de tratamiento de datos con sus proveedores actuales?' } },
      { key: 'retention_policy', type: 'bool',
        q: { en: 'Is there a written retention or deletion policy?',
             es: '¿Existe una política escrita de retención o borrado?' } }
    ]
  }
];

/** Section lookup by id. */
function section(id) { return SECTIONS.find(s => s.id === id) || null; }

/** Ordered section ids — the Director walks these in sequence. */
const SECTION_IDS = SECTIONS.map(s => s.id);

/**
 * Which required questions are still unanswered.
 * The Director refuses to run analysis while this is non-empty, because a
 * roadmap built on absent inputs is exactly the oversold artifact the CEO
 * already told us they have been burned by.
 */
function missingRequired(answersBySection = {}) {
  const gaps = [];
  SECTIONS.forEach(sec => {
    const payload = (answersBySection[sec.id] || {});
    sec.questions.filter(q => q.required).forEach(q => {
      const v = payload[q.key];
      const empty =
        v === undefined || v === null || v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (q.type === 'process_list' && (!Array.isArray(v) || !v.filter(p => p && p.name).length));
      if (empty) gaps.push({ section: sec.id, key: q.key, question: q.q });
    });
  });
  return gaps;
}

/** How far through the interview we are, 0-100. */
function completeness(answersBySection = {}) {
  let total = 0, done = 0;
  SECTIONS.forEach(sec => {
    const payload = answersBySection[sec.id] || {};
    sec.questions.forEach(q => {
      total++;
      const v = payload[q.key];
      const filled = !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));
      if (filled) done++;
    });
  });
  return total ? Math.round((done / total) * 100) : 0;
}

module.exports = { SECTIONS, SECTION_IDS, section, missingRequired, completeness };
