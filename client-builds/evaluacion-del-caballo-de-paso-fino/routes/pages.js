// =====================================================
// Pages — server-rendered, language-aware HTML.
//   GET /            -> upload + diagnostic-card UI (ES default; #8)
//   GET /dashboard   -> per-horse evaluation history
//   GET /privacidad  -> Ley 1581 data-protection note (#9)
//
// Rendered SERVER-SIDE so a raw GET (no JS) already shows the correct <h1>:
// GET / => Spanish "Evaluación…"; GET /?lang=en => English. The full dictionary
// is inlined as window.__I18N for the client.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pickLang, dict } = require('../lib/i18n');

const PUB = path.join(__dirname, '..', 'public');
const INDEX_TPL = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const DASH_TPL = fs.readFileSync(path.join(PUB, 'dashboard.html'), 'utf8');
const JUEZ_TPL = fs.readFileSync(path.join(PUB, 'juez.html'), 'utf8');
const LOGIN_TPL = fs.readFileSync(path.join(PUB, 'login.html'), 'utf8');
const SIGNUP_TPL = fs.readFileSync(path.join(PUB, 'signup.html'), 'utf8');
const INICIO_TPL = fs.readFileSync(path.join(PUB, 'inicio.html'), 'utf8');
const PANEL_TPL = fs.readFileSync(path.join(PUB, 'panel.html'), 'utf8');
const COMING_SOON_TPL = fs.readFileSync(path.join(PUB, 'coming-soon.html'), 'utf8');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function render(tpl, req) {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  return tpl
    .replace(/\{\{LANG\}\}/g, esc(lang))
    .replace(/\{\{BASE\}\}/g, esc(base))
    .replace(/\{\{TITLE\}\}/g, esc(d.title))
    .replace(/\{\{H1\}\}/g, esc(d.h1))
    .replace(/\{\{TAGLINE\}\}/g, esc(d.tagline))
    .replace(/\{\{DICT_JSON\}\}/g, JSON.stringify(d).replace(/</g, '\\u003c'));
}

router.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(INDEX_TPL, req));
});

router.get('/dashboard', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(DASH_TPL, req));
});

// /juez — the championship judge (video + audio -> modality + score + ranking).
router.get('/juez', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(JUEZ_TPL, req));
});

// Account pages (own auth system): login + signup.
router.get('/login', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(LOGIN_TPL, req));
});
router.get('/signup', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(SIGNUP_TPL, req));
});

// Public landing page (front door -> register/login).
router.get('/inicio', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(INICIO_TPL, req));
});
// Client dashboard shell (left-nav app; gated client-side by login).
router.get('/panel', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(PANEL_TPL, req));
});
// Coming Soon (discipline teasers: Jumper / Hunter / Ponies / Equitation).
router.get('/coming-soon', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(render(COMING_SOON_TPL, req));
});

// /privacidad — Ley 1581 de 2012 statement: no personal data is processed.
router.get('/privacidad', (req, res) => {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  const body = lang === 'en'
    ? `<h1>Data Protection</h1>
<p>This proof-of-concept processes <strong>no personal data</strong>. It stores only horse names and gait metrics derived from an uploaded audio clip. No owner identifiers, contact details, or other personal information are collected, stored, or shared.</p>
<p>Because no personal data is processed, the requirements of Colombia's <strong>Ley 1581 de 2012</strong> (Habeas Data) are met by design. Uploaded audio is analyzed in memory and discarded; it is never persisted.</p>
<p><a href="${esc(base)}">&larr; Back</a></p>`
    : `<h1>Protección de Datos</h1>
<p>Esta prueba de concepto <strong>no procesa datos personales</strong>. Solo almacena nombres de caballos y métricas de marcha derivadas de un audio cargado. No se recopilan, almacenan ni comparten identificadores del propietario, datos de contacto ni ninguna otra información personal.</p>
<p>Dado que no se procesan datos personales, los requisitos de la <strong>Ley 1581 de 2012</strong> (Habeas Data) de Colombia se cumplen por diseño. El audio cargado se analiza en memoria y se descarta; nunca se persiste.</p>
<p><a href="${esc(base)}">&larr; Volver</a></p>`;
  const html = `<!doctype html><html lang="${esc(lang)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.privacy_title || 'Privacidad')} — ${esc(d.title)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-slate-950 text-slate-100 min-h-screen">
<main class="max-w-2xl mx-auto px-6 py-16 prose prose-invert">${body}</main>
</body></html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

// -----------------------------------------------------------------------------
// Legal pages: /terminos (Terms of Service) + /reembolsos (Refund Policy).
// Spanish is the AUTHORITATIVE version (Colombian market / governing law);
// English is a courtesy translation. Shared dark-theme shell matches /privacidad.
// Placeholders in [BRACKETS] must be completed by the operator before launch.
// -----------------------------------------------------------------------------
function legalShell(lang, titleTxt, brandTitle, body) {
  return `<!doctype html><html lang="${esc(lang)}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titleTxt)} — ${esc(brandTitle)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-slate-950 text-slate-100 min-h-screen">
<main class="max-w-3xl mx-auto px-6 py-16 prose prose-invert prose-headings:text-indigo-200 prose-a:text-indigo-300">${body}</main>
</body></html>`;
}

// /terminos — Terms of Service.
router.get('/terminos', (req, res) => {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  const updated = '4 de julio de 2026';
  const body = lang === 'en' ? `
<h1>Terms of Service</h1>
<p><em>Last updated: July 4, 2026. English is a courtesy translation; the Spanish version prevails in case of conflict.</em></p>

<h2>1. Who we are &amp; acceptance</h2>
<p>EquiMind ("the Service", "we") is operated by Digit2AI [legal entity, NIT, domicile in Colombia]. By creating an account, purchasing credits, or using the Service you accept these Terms in full. If you do not agree, do not use the Service.</p>

<h2>2. What the Service is — and is not</h2>
<p>EquiMind is an <strong>informational and educational software tool</strong> that estimates the gait and characteristics of Paso Fino horses from audio and/or video you upload, using automated algorithms and AI.</p>
<p><strong>The Service is NOT, and must never be relied upon as:</strong> (a) an official or sanctioned competition result or judging authority; (b) veterinary, medical, or health advice or diagnosis; (c) a certification of a horse's value, breeding suitability, soundness, or fitness; (d) a basis for any purchase, sale, breeding, wagering, insurance, or medical decision. All results are automated <strong>estimates</strong> and may be inaccurate or incomplete.</p>

<h2>3. No warranty of accuracy</h2>
<p>Results depend on recording quality, surface, equipment, and factors outside our control. We do not warrant that any result is accurate, reliable, reproducible, or fit for any purpose. You are solely responsible for how you interpret and use any result. Always consult a licensed veterinarian and/or a certified judge for any decision that matters.</p>

<h2>4. Eligibility &amp; accounts</h2>
<p>You must be at least 18 years old (or use the Service through a legal representative). You are responsible for the confidentiality of your credentials and for all activity under your account. Provide accurate information and keep it current.</p>

<h2>5. Credits &amp; payment</h2>
<p>Paid features run on credits purchased through our payment processor (Stripe). Prices are shown before purchase and may change prospectively. <strong>A credit is consumed only when a real analysis is performed</strong> (real uploaded audio/video with a detectable signal). When no usable real signal is present, the Service returns a free reference simulation and no credit is charged. Credits have no cash value except as required by law and are non-transferable outside your linked EquiMind account family.</p>

<h2>6. Refunds</h2>
<p>Refunds are governed by our <a href="${esc(base)}reembolsos">Refund Policy</a>, incorporated into these Terms by reference.</p>

<h2>7. Your content &amp; acceptable use</h2>
<p>You represent that you own or have the rights to any audio, video, images, and horse information you upload, and that your use does not involve animal cruelty, illegal activity, or the infringement of any third party's rights. You grant us a limited license to process your uploads solely to provide the Service. You must not misuse, reverse-engineer, overload, scrape, or resell the Service.</p>

<h2>8. Shared/public reports</h2>
<p>If you generate a public share link for a report, you accept that anyone with the link can view that report. You choose whether to share; we are not responsible for further distribution by you or recipients.</p>

<h2>9. Intellectual property</h2>
<p>The Service, its software, models, scoring logic, branding, and design are owned by Digit2AI and protected by law. These Terms grant you a personal, non-exclusive, non-transferable, revocable license to use the Service; no other rights are granted.</p>

<h2>10. Assumption of risk &amp; indemnification</h2>
<p>Activities involving horses are inherently dangerous. You assume all risk arising from your equine activities. You agree to indemnify and hold harmless Digit2AI, its owners, staff, and providers from any claim, loss, or liability arising out of your use of the Service, your uploads, or your reliance on any result.</p>

<h2>11. "AS IS" — disclaimer of warranties</h2>
<p>To the maximum extent permitted by law, the Service is provided <strong>"AS IS" and "AS AVAILABLE"</strong>, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, accuracy, and non-infringement. We do not warrant uninterrupted or error-free operation.</p>

<h2>12. Limitation of liability</h2>
<p>To the maximum extent permitted by law, Digit2AI and its providers shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits, data, goodwill, animals, or opportunities, arising from the Service. Our total aggregate liability for any and all claims shall not exceed the greater of (a) the amount you paid us in the three (3) months before the event giving rise to the claim, or (b) USD 50. Nothing in these Terms limits liability that cannot be limited under applicable Colombian consumer law.</p>

<h2>13. Changes, suspension &amp; termination</h2>
<p>We may modify the Service or these Terms at any time; material changes take effect when posted here. We may suspend or terminate accounts that violate these Terms. You may stop using the Service at any time.</p>

<h2>14. Governing law &amp; disputes</h2>
<p>These Terms are governed by the laws of the Republic of Colombia. Any dispute shall first be addressed in good faith by writing to us; failing resolution within 30 days, it shall be submitted to the competent courts / arbitration center of [CITY], Colombia. Your mandatory rights under Colombia's Consumer Statute (Ley 1480 de 2011) and Habeas Data (Ley 1581 de 2012) are unaffected.</p>

<h2>15. General</h2>
<p>If any provision is held unenforceable, the rest remains in effect. These Terms are the entire agreement between you and us regarding the Service.</p>

<h2>16. Contact</h2>
<p>[soporte@equimind.app] · Digit2AI · [address].</p>
<p><a href="${esc(base)}">&larr; Back</a> · <a href="${esc(base)}reembolsos">Refund Policy</a> · <a href="${esc(base)}privacidad">Privacy</a></p>
` : `
<h1>Términos de Servicio</h1>
<p><em>Última actualización: ${updated}. Esta versión en español es la versión autorizada y prevalece sobre cualquier traducción.</em></p>

<h2>1. Quiénes somos y aceptación</h2>
<p>EquiMind ("el Servicio", "nosotros") es operado por Digit2AI [razón social, NIT, domicilio en Colombia]. Al crear una cuenta, comprar créditos o usar el Servicio, usted acepta íntegramente estos Términos. Si no está de acuerdo, no use el Servicio.</p>

<h2>2. Qué es el Servicio y qué no es</h2>
<p>EquiMind es una <strong>herramienta de software con fines informativos y educativos</strong> que estima la marcha y características de caballos de Paso Fino a partir del audio o video que usted carga, mediante algoritmos automatizados e inteligencia artificial.</p>
<p><strong>El Servicio NO es, ni debe usarse como:</strong> (a) un fallo oficial de competencia ni una autoridad de juzgamiento sancionada; (b) asesoría, diagnóstico ni consejo veterinario, médico o de salud; (c) una certificación del valor, aptitud reproductiva, sanidad o idoneidad de un caballo; (d) fundamento para decisiones de compra, venta, cría, apuestas, seguros o tratamientos. Todos los resultados son <strong>estimaciones automáticas</strong> y pueden ser inexactos o incompletos.</p>

<h2>3. Sin garantía de exactitud</h2>
<p>Los resultados dependen de la calidad de la grabación, la superficie, el equipo y factores fuera de nuestro control. No garantizamos que ningún resultado sea exacto, fiable, reproducible ni apto para un fin determinado. Usted es el único responsable de cómo interpreta y utiliza cualquier resultado. Consulte siempre a un médico veterinario titulado o a un juez certificado para cualquier decisión relevante.</p>

<h2>4. Elegibilidad y cuentas</h2>
<p>Usted debe ser mayor de 18 años (o actuar a través de un representante legal). Es responsable de la confidencialidad de sus credenciales y de toda actividad en su cuenta. Proporcione información veraz y manténgala actualizada.</p>

<h2>5. Créditos y pagos</h2>
<p>Las funciones pagas operan con créditos adquiridos a través de nuestro procesador de pagos (Stripe). Los precios se muestran antes de la compra y pueden cambiar hacia el futuro. <strong>Un crédito se consume únicamente cuando se realiza un análisis real</strong> (audio o video cargado con señal detectable). Cuando no existe señal real utilizable, el Servicio devuelve una simulación de referencia gratuita y no se cobra crédito. Los créditos no tienen valor en efectivo salvo que la ley lo exija y no son transferibles fuera de su familia de cuentas EquiMind vinculada.</p>

<h2>6. Reembolsos</h2>
<p>Los reembolsos se rigen por nuestra <a href="${esc(base)}reembolsos">Política de Reembolso</a>, incorporada a estos Términos por referencia.</p>

<h2>7. Su contenido y uso aceptable</h2>
<p>Usted declara que es titular o cuenta con los derechos sobre todo audio, video, imagen e información de caballos que cargue, y que su uso no implica maltrato animal, actividad ilícita ni la vulneración de derechos de terceros. Nos concede una licencia limitada para procesar sus cargas con el único fin de prestar el Servicio. No debe usar indebidamente, aplicar ingeniería inversa, sobrecargar, extraer datos ni revender el Servicio.</p>

<h2>8. Reportes compartidos o públicos</h2>
<p>Si genera un enlace público para un reporte, acepta que cualquier persona con el enlace pueda verlo. Usted decide si comparte; no somos responsables de la difusión posterior que usted o los destinatarios realicen.</p>

<h2>9. Propiedad intelectual</h2>
<p>El Servicio, su software, modelos, lógica de puntuación, marca y diseño son propiedad de Digit2AI y están protegidos por la ley. Estos Términos le otorgan una licencia personal, no exclusiva, intransferible y revocable de uso; no se conceden otros derechos.</p>

<h2>10. Asunción de riesgo e indemnidad</h2>
<p>Las actividades con caballos son inherentemente peligrosas. Usted asume todo riesgo derivado de sus actividades equinas. Se obliga a mantener indemne a Digit2AI, sus propietarios, personal y proveedores frente a cualquier reclamación, pérdida o responsabilidad derivada del uso del Servicio, de sus cargas o de su confianza en cualquier resultado.</p>

<h2>11. "TAL CUAL" — exclusión de garantías</h2>
<p>En la máxima medida permitida por la ley, el Servicio se presta <strong>"TAL CUAL" y "SEGÚN DISPONIBILIDAD"</strong>, sin garantías de ningún tipo, expresas o implícitas, incluidas comerciabilidad, idoneidad para un fin particular, exactitud y no infracción. No garantizamos un funcionamiento ininterrumpido ni libre de errores.</p>

<h2>12. Limitación de responsabilidad</h2>
<p>En la máxima medida permitida por la ley, Digit2AI y sus proveedores no serán responsables por daños indirectos, incidentales, especiales, consecuenciales o punitivos, ni por lucro cesante, pérdida de datos, reputación, animales u oportunidades derivados del Servicio. Nuestra responsabilidad total acumulada por todas las reclamaciones no excederá el mayor valor entre (a) lo que usted nos pagó en los tres (3) meses previos al hecho que origina la reclamación, o (b) USD 50. Nada en estos Términos limita la responsabilidad que no pueda limitarse conforme al Estatuto del Consumidor colombiano.</p>

<h2>13. Cambios, suspensión y terminación</h2>
<p>Podemos modificar el Servicio o estos Términos en cualquier momento; los cambios sustanciales rigen desde su publicación aquí. Podemos suspender o cancelar cuentas que incumplan estos Términos. Usted puede dejar de usar el Servicio en cualquier momento.</p>

<h2>14. Ley aplicable y controversias</h2>
<p>Estos Términos se rigen por las leyes de la República de Colombia. Toda controversia se abordará primero de buena fe escribiéndonos; de no resolverse en 30 días, se someterá a los jueces competentes / centro de arbitraje de [CIUDAD], Colombia. Sus derechos imperativos bajo el Estatuto del Consumidor (Ley 1480 de 2011) y de Habeas Data (Ley 1581 de 2012) permanecen intactos.</p>

<h2>15. Disposiciones generales</h2>
<p>Si alguna cláusula resulta inejecutable, el resto conserva su vigencia. Estos Términos constituyen el acuerdo íntegro entre usted y nosotros respecto del Servicio.</p>

<h2>16. Contacto</h2>
<p>[soporte@equimind.app] · Digit2AI · [dirección].</p>
<p><a href="${esc(base)}">&larr; Volver</a> · <a href="${esc(base)}reembolsos">Política de Reembolso</a> · <a href="${esc(base)}privacidad">Privacidad</a></p>
`;
  res.set('Content-Type', 'text/html; charset=utf-8')
     .send(legalShell(lang, lang === 'en' ? 'Terms of Service' : 'Términos de Servicio', d.title, body));
});

// /reembolsos — Refund Policy.
router.get('/reembolsos', (req, res) => {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  const updated = '4 de julio de 2026';
  const body = lang === 'en' ? `
<h1>Refund Policy</h1>
<p><em>Last updated: July 4, 2026. English is a courtesy translation; the Spanish version prevails.</em></p>

<h2>1. Digital nature of the product</h2>
<p>Credits and the analyses they unlock are <strong>digital products delivered instantly</strong>. As a general rule, once a credit has been consumed to produce a result, that purchase is <strong>non-refundable</strong>, because the service has been fully rendered.</p>

<h2>2. You only pay for real analyses</h2>
<p>A credit is charged <strong>only when a real analysis runs</strong> (real audio/video with a detectable signal). If there is no usable signal, EquiMind returns a <strong>free reference simulation</strong> and no credit is charged. This design minimizes billing disputes.</p>

<h2>3. When we DO issue a refund</h2>
<ul>
<li><strong>Verifiable technical failure:</strong> a credit was charged but, due to a fault on our side, no result was delivered. We will restore the credit or refund it at our discretion.</li>
<li><strong>Duplicate/erroneous charge</strong> by the payment processor.</li>
<li>Any case where a refund is required by applicable Colombian consumer law.</li>
</ul>

<h2>4. Unused credits</h2>
<p>Unused credit balances may be refunded within <strong>fourteen (14) days</strong> of purchase, provided none of the credits in that purchase have been consumed. After 14 days, or once any credit from the purchase has been used, unused credits are non-refundable but remain available in your account.</p>

<h2>5. Colombian right of withdrawal (retracto)</h2>
<p>Under Article 47 of Colombia's Consumer Statute (Ley 1480 de 2011), consumers generally have five (5) business days to withdraw from certain distance purchases. This right does <strong>not</strong> apply to digital content and services that, with your prior consent, have already begun to be delivered or have been consumed. By running an analysis you request immediate delivery and acknowledge the retracto right is thereby exhausted for consumed credits.</p>

<h2>6. How to request a refund</h2>
<p>Email [soporte@equimind.app] within the applicable window with your account email, the date, and the transaction/receipt reference. We aim to respond within 10 business days. Approved refunds are returned to the original payment method via Stripe.</p>

<h2>7. Chargebacks</h2>
<p>Please contact us before opening a chargeback so we can resolve the issue directly and quickly.</p>

<p><a href="${esc(base)}">&larr; Back</a> · <a href="${esc(base)}terminos">Terms of Service</a> · <a href="${esc(base)}privacidad">Privacy</a></p>
` : `
<h1>Política de Reembolso</h1>
<p><em>Última actualización: ${updated}. Esta versión en español es la autorizada y prevalece sobre cualquier traducción.</em></p>

<h2>1. Naturaleza digital del producto</h2>
<p>Los créditos y los análisis que habilitan son <strong>productos digitales de entrega inmediata</strong>. Por regla general, una vez que un crédito se ha consumido para producir un resultado, esa compra <strong>no es reembolsable</strong>, pues el servicio se prestó en su totalidad.</p>

<h2>2. Usted solo paga por análisis reales</h2>
<p>Un crédito se cobra <strong>únicamente cuando se ejecuta un análisis real</strong> (audio o video con señal detectable). Si no hay señal utilizable, EquiMind devuelve una <strong>simulación de referencia gratuita</strong> y no se cobra crédito. Este diseño reduce al mínimo las disputas de facturación.</p>

<h2>3. Cuándo SÍ hacemos un reembolso</h2>
<ul>
<li><strong>Falla técnica verificable:</strong> se cobró un crédito pero, por un error de nuestra parte, no se entregó ningún resultado. Restauraremos el crédito o lo reembolsaremos a nuestra discreción.</li>
<li><strong>Cobro duplicado o erróneo</strong> del procesador de pagos.</li>
<li>Todo caso en que el reembolso sea exigido por el Estatuto del Consumidor colombiano aplicable.</li>
</ul>

<h2>4. Créditos no utilizados</h2>
<p>Los saldos de créditos no utilizados podrán reembolsarse dentro de los <strong>catorce (14) días</strong> siguientes a la compra, siempre que ningún crédito de esa compra haya sido consumido. Después de 14 días, o una vez usado cualquier crédito de la compra, los créditos no utilizados no son reembolsables, pero permanecen disponibles en su cuenta.</p>

<h2>5. Derecho de retracto (Colombia)</h2>
<p>Conforme al artículo 47 de la Ley 1480 de 2011 (Estatuto del Consumidor), el consumidor dispone por regla general de cinco (5) días hábiles para retractarse de ciertas compras a distancia. Este derecho <strong>no</strong> aplica a contenidos y servicios digitales que, con su consentimiento previo, ya comenzaron a ejecutarse o fueron consumidos. Al ejecutar un análisis, usted solicita la entrega inmediata y reconoce que el derecho de retracto queda así agotado respecto de los créditos consumidos.</p>

<h2>6. Cómo solicitar un reembolso</h2>
<p>Escriba a [soporte@equimind.app] dentro del plazo aplicable indicando el correo de su cuenta, la fecha y la referencia de la transacción o recibo. Buscamos responder en un plazo de 10 días hábiles. Los reembolsos aprobados se devuelven al medio de pago original a través de Stripe.</p>

<h2>7. Contracargos</h2>
<p>Por favor contáctenos antes de abrir un contracargo para resolver el asunto de forma directa y rápida.</p>

<p><a href="${esc(base)}">&larr; Volver</a> · <a href="${esc(base)}terminos">Términos de Servicio</a> · <a href="${esc(base)}privacidad">Privacidad</a></p>
`;
  res.set('Content-Type', 'text/html; charset=utf-8')
     .send(legalShell(lang, lang === 'en' ? 'Refund Policy' : 'Política de Reembolso', d.title, body));
});

module.exports = router;
