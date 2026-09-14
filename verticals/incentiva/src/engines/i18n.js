'use strict';

/**
 * Every buyer-facing label and fixed sentence, in English and Spanish.
 * Assembled deterministically; the model never authors these.
 */

const L = {
  en: {
    incentive_type: {
      closing_cost_assistance: 'Closing cost assistance', rate_buydown_permanent: 'Permanent rate buydown',
      rate_buydown_temporary: 'Temporary rate buydown', below_market_fixed_rate: 'Below-market fixed rate',
      price_reduction: 'Price reduction', flex_cash: 'Flex cash', design_center_credit: 'Design center credit',
      options_package: 'Included options', lot_premium_waived: 'Lot premium waived', hoa_or_cdd_paid: 'HOA or CDD paid',
      lender_partner_offer: 'Lender partner offer', broker_bonus: 'Agent bonus', other: 'Other offer'
    },
    financing: { preapproved: 'Pre-approved', cash: 'Cash', needs_lender: 'Needs a lender', va: 'VA loan', fha: 'FHA loan', unsure: 'Not sure yet' },
    timeline: { '0_3m': 'Within 3 months', '3_6m': '3 to 6 months', '6_12m': '6 to 12 months', '12m_plus': 'More than 12 months' },
    must_haves: {
      single_story: 'Single story', pool: 'Pool', three_car_garage: '3-car garage', office: 'Home office',
      no_cdd: 'No CDD fee', age_restricted: 'Age-restricted (55+) community', move_in_90_days: 'Move in within 90 days'
    },
    scenario: { base: 'No incentive applied' },
    unmodeled: {
      no_reference_rate: 'Not estimated: no reference interest rate has been set yet.',
      lender_required_cash_buyer: 'Not applicable: requires the builder\'s lender and you plan to pay cash.',
      cash_buyer_no_loan: 'Not applicable to a cash purchase.',
      value_not_stated: 'Not estimated: the builder did not state an amount.',
      rate_not_stated: 'Not estimated: the builder did not state the rate.',
      schedule_not_stated: 'Not estimated: the buydown schedule was not stated.',
      schedule_longer_than_two_years: 'Not estimated here: a buydown longer than two years. Ask your agent for the full schedule.',
      closing_costs_not_estimated: 'Not estimated: closing costs have no estimate set yet.',
      credit_not_applied_to_payment: 'Shown as a credit; it does not change the estimated payment.'
    },
    lender_required: { true: 'Builder\'s lender required', false: 'Any lender', null: 'Lender requirement not stated' },
    withheld_reason: 'Current incentives are still being confirmed with the builder.',
    fit: {
      price_ok: 'Priced at {price}, within your {budget} budget.',
      price_over: 'Priced at {price}, above your {budget} budget.',
      price_unknown: 'Price not yet published.',
      zip_match: 'In ZIP code {zip}, one of your target areas.',
      within_radius: 'About {miles} miles from your target area.',
      outside_area: 'Outside your target area.',
      area_unknown: 'Location could not be compared to your target area.',
      beds_ok: '{beds} bedrooms and {baths} bathrooms meets your minimum.',
      beds_short: '{beds} bedrooms and {baths} bathrooms is below your minimum.',
      timeline_ok: 'Ready {ready}, which fits your timeline.',
      timeline_late: 'Ready {ready}, later than your timeline.',
      timeline_tbb: 'To be built; completion date not published.',
      must_ok: 'Has: {label}.',
      must_missing: 'Does not have: {label}.',
      must_unknown: 'Not confirmed: {label}.',
      monthly_ok: 'Estimated payment is within your monthly limit.',
      monthly_over: 'Estimated payment is above your monthly limit.'
    },
    ready_now: 'now',
    narrative: {
      opening_one: 'I found 1 new-home option that matches what you asked for. Every incentive below was confirmed with the builder, and each shows the date it was last verified.',
      opening_some: 'I compared {n} new-home options that match what you asked for. Every incentive below was confirmed with the builder, and each shows the date it was last verified.',
      opening_none: 'No community in your area has verified incentives that match your criteria right now. That can change weekly; I will keep watching.',
      top_pick: 'First, look at {community} by {builder}: {reasons}',
      also_pick: 'Also consider {community} by {builder}: {reasons}',
      watch_fees: 'Confirm the HOA and CDD fees at {community}; they are not published yet and can change the monthly cost.',
      watch_lender: '{community}: {headline} requires the builder\'s lender. Compare that lender\'s rate and fees with your own.',
      watch_buydown: '{community}: a temporary buydown lowers the payment only for the first years. Plan around the Year 3+ payment of {amount}.',
      watch_close_by: '{community}: {headline} requires closing by {date}. Check that date against your move plans.',
      q1: 'Which homes qualify for each current incentive, and can incentives be combined?',
      q2: 'What are the HOA and CDD fees, and are CDD bond payments included in the tax bill?',
      q3: 'If I use my own lender, which incentives do I lose?',
      q4: 'What is the estimated completion date, and what happens to the incentive if construction runs late?',
      next_step: 'Before visiting any sales office, request a call. Many builders only work with a buyer\'s agent who registers you before your first visit.'
    },
    assumptions: {
      rate: 'Interest rate used', down: 'Down payment assumed', tax: 'Property tax', insurance: 'Homeowners insurance',
      pmi: 'Mortgage insurance', closing: 'Closing costs', stacking: 'Combining incentives'
    },
    basis: {
      rate: 'Reference rate for comparison, not a loan offer. Source: {source}, as of {date}.',
      down: 'Your stated down payment, or a common default for your financing type.',
      tax: 'Estimated share of price per year. New homes are often taxed on land only in the first year, so the first bill can be lower than later bills.',
      insurance: 'An assumption, not a quote.',
      pmi: 'Applied when a conventional or FHA loan has less than 20% down. VA funding fee not included.',
      closing: 'Estimated share of price. Your lender provides the real figure.',
      stacking: 'Each incentive is shown on its own. Combining offers is not estimated.'
    },
    not_set: 'Not set',
    disclosures: {
      platform: 'BuyersLine is a technology platform, not a real estate brokerage and not a lender.',
      compensation: 'The licensed agent we connect you with pays BuyersLine a fee when you meet with them. You pay nothing. Builders pay the agent\'s brokerage at closing under your buyer agreement.',
      estimates: 'Payment figures are estimates for comparison only. They are not a loan approval, offer or commitment. Your lender will provide actual terms.',
      incentives: 'Incentives are set by each builder, can change or end at any time, may apply only to certain homes, and may require the builder\'s lender or title company. We show only incentives a licensed agent confirmed, with the date confirmed. We do not represent any builder.',
      equal_housing: 'Equal Housing Opportunity.'
    },
    consent: {
      email: 'Email me my report and updates about new-home incentives in my area. I can unsubscribe at any time.',
      sms: 'Text me about my report and incentive updates at the number I provided. Message frequency varies; message and data rates may apply. Reply STOP to opt out. Consent is not required to get a report.',
      share_named: 'Share my name, contact details and criteria with {agent}, a licensed real estate sales associate with {brokerage}, who may contact me about my search.',
      co_owner: '{agent} is a co-owner of BuyersLine.',
      share_unnamed: 'Share my name, contact details and criteria with a licensed real estate agent BuyersLine works with, who may contact me about my search. We will tell you who before they reach out.'
    },
    stopped_other_agent: 'Thanks for being upfront. Please keep working with your agent. We will not contact you.',
    area_summary_zips: 'ZIP {zips}', area_summary_place: '{place}', area_radius: 'within {miles} miles'
  },
  es: {
    incentive_type: {
      closing_cost_assistance: 'Ayuda con costos de cierre', rate_buydown_permanent: 'Reducción permanente de tasa',
      rate_buydown_temporary: 'Reducción temporal de tasa', below_market_fixed_rate: 'Tasa fija por debajo del mercado',
      price_reduction: 'Reducción de precio', flex_cash: 'Crédito flexible', design_center_credit: 'Crédito para el centro de diseño',
      options_package: 'Mejoras incluidas', lot_premium_waived: 'Sin recargo por lote', hoa_or_cdd_paid: 'HOA o CDD pagado',
      lender_partner_offer: 'Oferta del prestamista aliado', broker_bonus: 'Bono para el agente', other: 'Otra oferta'
    },
    financing: { preapproved: 'Preaprobado', cash: 'Efectivo', needs_lender: 'Necesita prestamista', va: 'Préstamo VA', fha: 'Préstamo FHA', unsure: 'Aún no lo sé' },
    timeline: { '0_3m': 'En menos de 3 meses', '3_6m': 'De 3 a 6 meses', '6_12m': 'De 6 a 12 meses', '12m_plus': 'Más de 12 meses' },
    must_haves: {
      single_story: 'Una sola planta', pool: 'Piscina', three_car_garage: 'Garaje para 3 autos', office: 'Oficina en casa',
      no_cdd: 'Sin cargo CDD', age_restricted: 'Comunidad para mayores de 55', move_in_90_days: 'Mudanza en menos de 90 días'
    },
    scenario: { base: 'Sin incentivo' },
    unmodeled: {
      no_reference_rate: 'Sin estimar: aún no se ha fijado una tasa de interés de referencia.',
      lender_required_cash_buyer: 'No aplica: exige el prestamista de la constructora y usted pagará en efectivo.',
      cash_buyer_no_loan: 'No aplica a una compra en efectivo.',
      value_not_stated: 'Sin estimar: la constructora no indicó el monto.',
      rate_not_stated: 'Sin estimar: la constructora no indicó la tasa.',
      schedule_not_stated: 'Sin estimar: no se indicó el calendario de la reducción.',
      schedule_longer_than_two_years: 'Sin estimar aquí: una reducción de más de dos años. Pídale el calendario completo a su agente.',
      closing_costs_not_estimated: 'Sin estimar: aún no hay una estimación de costos de cierre.',
      credit_not_applied_to_payment: 'Se muestra como crédito; no cambia el pago estimado.'
    },
    lender_required: { true: 'Exige el prestamista de la constructora', false: 'Cualquier prestamista', null: 'Requisito de prestamista no indicado' },
    withheld_reason: 'Sus incentivos actuales aún se están confirmando con la constructora.',
    fit: {
      price_ok: 'Precio de {price}, dentro de su presupuesto de {budget}.',
      price_over: 'Precio de {price}, por encima de su presupuesto de {budget}.',
      price_unknown: 'Precio aún no publicado.',
      zip_match: 'En el código postal {zip}, una de sus zonas.',
      within_radius: 'A unas {miles} millas de su zona.',
      outside_area: 'Fuera de su zona.',
      area_unknown: 'No se pudo comparar la ubicación con su zona.',
      beds_ok: '{beds} habitaciones y {baths} baños cumple su mínimo.',
      beds_short: '{beds} habitaciones y {baths} baños está por debajo de su mínimo.',
      timeline_ok: 'Lista {ready}, dentro de sus plazos.',
      timeline_late: 'Lista {ready}, después de sus plazos.',
      timeline_tbb: 'Por construir; fecha de entrega no publicada.',
      must_ok: 'Tiene: {label}.',
      must_missing: 'No tiene: {label}.',
      must_unknown: 'Sin confirmar: {label}.',
      monthly_ok: 'El pago estimado está dentro de su límite mensual.',
      monthly_over: 'El pago estimado supera su límite mensual.'
    },
    ready_now: 'ya',
    narrative: {
      opening_one: 'Encontré 1 opción de casa nueva que coincide con lo que me pidió. Cada incentivo de este informe se confirmó con la constructora y muestra la fecha de su última verificación.',
      opening_some: 'Comparé {n} opciones de casas nuevas que coinciden con lo que me pidió. Cada incentivo de este informe se confirmó con la constructora y muestra la fecha de su última verificación.',
      opening_none: 'Ahora mismo ninguna comunidad de su zona tiene incentivos verificados que coincidan con lo que busca. Eso cambia cada semana; seguiré atento.',
      top_pick: 'Primero, mire {community} de {builder}: {reasons}',
      also_pick: 'También considere {community} de {builder}: {reasons}',
      watch_fees: 'Confirme las cuotas de HOA y CDD en {community}; aún no están publicadas y pueden cambiar el costo mensual.',
      watch_lender: '{community}: {headline} exige el prestamista de la constructora. Compare su tasa y sus cargos con los de su propio prestamista.',
      watch_buydown: '{community}: una reducción temporal baja el pago solo los primeros años. Planifique con el pago del Año 3 en adelante, de {amount}.',
      watch_close_by: '{community}: {headline} exige cerrar antes del {date}. Revise esa fecha frente a sus planes de mudanza.',
      q1: '¿Qué casas califican para cada incentivo actual y se pueden combinar?',
      q2: '¿Cuánto son las cuotas de HOA y CDD, y el pago del bono CDD va incluido en la factura de impuestos?',
      q3: 'Si uso mi propio prestamista, ¿qué incentivos pierdo?',
      q4: '¿Cuál es la fecha estimada de entrega y qué pasa con el incentivo si la obra se retrasa?',
      next_step: 'Antes de visitar cualquier oficina de ventas, solicite una llamada. Muchas constructoras solo trabajan con el agente del comprador si este lo registra antes de su primera visita.'
    },
    assumptions: {
      rate: 'Tasa de interés usada', down: 'Pago inicial supuesto', tax: 'Impuesto predial', insurance: 'Seguro de vivienda',
      pmi: 'Seguro hipotecario', closing: 'Costos de cierre', stacking: 'Combinación de incentivos'
    },
    basis: {
      rate: 'Tasa de referencia para comparar, no una oferta de préstamo. Fuente: {source}, al {date}.',
      down: 'El pago inicial que indicó, o un valor habitual para su tipo de financiamiento.',
      tax: 'Proporción estimada del precio por año. Las casas nuevas suelen pagar solo sobre el terreno el primer año, así que la primera factura puede ser menor que las siguientes.',
      insurance: 'Un supuesto, no una cotización.',
      pmi: 'Se aplica cuando un préstamo convencional o FHA tiene menos del 20 % de pago inicial. No incluye el cargo de financiamiento VA.',
      closing: 'Proporción estimada del precio. Su prestamista le dará la cifra real.',
      stacking: 'Cada incentivo se muestra por separado. No se estima la combinación de ofertas.'
    },
    not_set: 'Sin fijar',
    disclosures: {
      platform: 'BuyersLine es una plataforma tecnológica, no una correduría de bienes raíces ni un prestamista.',
      compensation: 'El agente con licencia con quien lo conectamos le paga una tarifa a BuyersLine cuando se reúne con usted. Usted no paga nada. Las constructoras pagan a la correduría del agente al cierre, según su contrato de representación de comprador.',
      estimates: 'Los pagos son estimaciones para comparar. No constituyen una aprobación, oferta ni compromiso de préstamo. Su prestamista le dará las condiciones reales.',
      incentives: 'Cada constructora fija sus incentivos, que pueden cambiar o terminar en cualquier momento, aplicarse solo a ciertas casas y exigir el prestamista o la compañía de títulos de la constructora. Solo mostramos incentivos que un agente con licencia confirmó, con la fecha de confirmación. No representamos a ninguna constructora.',
      equal_housing: 'Igualdad de oportunidades en la vivienda.'
    },
    consent: {
      email: 'Envíenme mi informe y novedades sobre incentivos de casas nuevas en mi zona por correo electrónico. Puedo darme de baja cuando quiera.',
      sms: 'Envíenme mensajes de texto sobre mi informe y novedades de incentivos al número que indiqué. La frecuencia varía; pueden aplicarse tarifas de mensajes y datos. Responda STOP para no recibir más. No es necesario aceptar para recibir el informe.',
      share_named: 'Compartir mi nombre, datos de contacto y criterios con {agent}, asociado de ventas de bienes raíces con licencia de {brokerage}, quien podrá contactarme sobre mi búsqueda.',
      co_owner: '{agent} es copropietario de BuyersLine.',
      share_unnamed: 'Compartir mi nombre, datos de contacto y criterios con un agente de bienes raíces con licencia con quien trabaja BuyersLine, quien podrá contactarme sobre mi búsqueda. Le diremos quién es antes de que lo contacte.'
    },
    stopped_other_agent: 'Gracias por decírnoslo. Siga trabajando con su agente. No lo contactaremos.',
    area_summary_zips: 'Código postal {zips}', area_summary_place: '{place}', area_radius: 'a menos de {miles} millas'
  }
};

function lang(l) { return l === 'es' ? 'es' : 'en'; }
function t(l, pathStr, params) {
  const parts = pathStr.split('.');
  let v = L[lang(l)];
  for (const p of parts) v = v == null ? undefined : v[p];
  if (typeof v !== 'string') return v;
  return params ? v.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m)) : v;
}
function money(l, n) {
  if (n === null || n === undefined) return null;
  return new Intl.NumberFormat(lang(l) === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n));
}
function dateLabel(l, iso) {
  if (!iso) return null;
  const s = typeof iso === 'string' ? iso.slice(0, 10) : new Date(iso).toISOString().slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(lang(l) === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

module.exports = { L, t, lang, money, dateLabel };
