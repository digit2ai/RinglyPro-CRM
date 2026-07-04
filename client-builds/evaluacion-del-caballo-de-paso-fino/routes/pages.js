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

// /privacidad — Política de Tratamiento de Datos Personales (Ley 1581 de 2012 +
// Decreto 1074 de 2015). LIVE product: real accounts, payments, uploaded media.
// Spanish is the authoritative version; [BRACKETS] must be completed by the operator.
router.get('/privacidad', (req, res) => {
  const lang = pickLang(req.query.lang);
  const d = dict(lang);
  const base = (req.baseUrl || '') + '/';
  const updated = '4 de julio de 2026';
  const body = lang === 'en' ? `
<h1>Privacy Policy</h1>
<p><em>Last updated: July 4, 2026. This English-language policy applies to users in the United States, including the notices required by the California Consumer Privacy Act, as amended by the CPRA (collectively, "CCPA"), and comparable state privacy laws (e.g., Virginia, Colorado, Connecticut, Utah).</em></p>
<p>EquiMind is a <strong>live production service</strong> operated by Digit2AI [legal entity, U.S. state of formation, address]. Privacy contact: [privacy@equimind.app].</p>

<h2>1. Personal information we collect</h2>
<p>Over the past 12 months we have collected the following categories of personal information:</p>
<ul>
<li><strong>Identifiers &amp; account data:</strong> email, display name, and a securely hashed password.</li>
<li><strong>Commercial information:</strong> credits purchased and transaction history. Payments are processed by <strong>Stripe</strong>; we do <strong>not</strong> store full card numbers, only transaction references, amounts, and status.</li>
<li><strong>User content:</strong> audio, video, and/or images you submit, plus horse details (name, sex, coat, breeder) and the gait metrics derived from your uploads.</li>
<li><strong>Internet/technical activity:</strong> IP address (for security and rate-limiting), an authentication cookie (<code>ecpf_token</code>), and server logs.</li>
</ul>
<p>We collect this information directly from you and automatically as you use the Service.</p>

<h2>2. How we use it</h2>
<p>To create and secure your account; run the gait analyses you request; process payments and credits; generate and, at your choice, share reports; provide support; ensure security and prevent fraud/abuse; and comply with legal obligations. We do not use your information for automated decision-making that produces legal or similarly significant effects about you.</p>

<h2>3. How we disclose it</h2>
<p>We disclose personal information only to service providers who help us operate the Service under written contracts restricting their use of it — notably <strong>Stripe</strong> (payment processing) and <strong>Render</strong> (cloud hosting) — and when required by law or to protect our rights.</p>

<h2>4. We do NOT sell or "share" your personal information</h2>
<p>We do <strong>not</strong> sell your personal information, and we do <strong>not</strong> "share" it for cross-context behavioral advertising, as those terms are defined under the CCPA. We have not done so in the preceding 12 months, including for consumers under 16.</p>

<h2>5. Your U.S. privacy rights</h2>
<p>Depending on your state of residence, you may have the right to:</p>
<ul>
<li><strong>Know / access</strong> the personal information we have collected about you and how we use and disclose it.</li>
<li><strong>Delete</strong> personal information we collected from you, subject to legal exceptions.</li>
<li><strong>Correct</strong> inaccurate personal information.</li>
<li><strong>Opt out</strong> of any sale or "sharing" of personal information (note: we do not sell or share).</li>
<li><strong>Limit</strong> the use of sensitive personal information (we do not use sensitive PI beyond permitted purposes).</li>
<li><strong>Non-discrimination</strong> for exercising your rights.</li>
</ul>
<p>To exercise these rights, email [privacy@equimind.app]. We will verify your request using your account information and respond within the time required by law (generally 45 days, extendable). You may use an authorized agent, subject to verification. If we decline a request, you may appeal by replying to our response.</p>

<h2>6. California "Shine the Light" &amp; Do Not Track</h2>
<p>We do not disclose personal information to third parties for their own direct-marketing purposes (Cal. Civ. Code §1798.83). Because there is no consistent industry standard, we do not respond to browser "Do Not Track" signals; we do treat recognized opt-out preference signals where required by law.</p>

<h2>7. Retention</h2>
<p>We keep account and analysis data for as long as your account is active and thereafter only as required to meet legal, accounting, or dispute-resolution obligations, after which it is deleted or de-identified. Video is <strong>not</strong> stored on our servers; audio is analyzed and the resulting metrics (not the raw file) are what we retain, together with a limited set of pose keypoints for traceability.</p>

<h2>8. Security</h2>
<p>We apply reasonable technical and administrative safeguards: password hashing, HTTPS, HttpOnly/Secure authentication cookies, rate limiting, and access controls. No system is completely secure, but we work to protect your information.</p>

<h2>9. Cookies</h2>
<p>We use a strictly necessary authentication cookie (<code>ecpf_token</code>) to keep you signed in. It is not used for advertising or cross-site tracking.</p>

<h2>10. Children's privacy</h2>
<p>The Service is not directed to children under 13, and we do not knowingly collect personal information from children under 13 (COPPA). If you believe a child provided us information, contact [privacy@equimind.app] and we will delete it.</p>

<h2>11. Data location</h2>
<p>We and our providers process and store data on servers located in the United States.</p>

<h2>12. Changes</h2>
<p>We may update this policy; the current version is always published here with its date.</p>

<p><a href="${esc(base)}">&larr; Back</a> · <a href="${esc(base)}terminos">Terms</a> · <a href="${esc(base)}reembolsos">Refunds</a></p>
` : `
<h1>Política de Tratamiento de Datos Personales</h1>
<p><em>Última actualización: ${updated}. Esta versión en español aplica a los usuarios en Colombia y se rige por la ley colombiana. Los usuarios en Estados Unidos deben consultar la <a href="${esc(base)}privacidad?lang=en">versión en inglés</a> (CCPA/CPRA).</em></p>
<p>EquiMind es un <strong>servicio en producción y en operación real</strong>. Esta política explica qué datos personales tratamos, con qué finalidad y qué derechos le asisten conforme a la <strong>Ley 1581 de 2012</strong> (Habeas Data) y el <strong>Decreto 1074 de 2015</strong> de Colombia.</p>

<h2>1. Responsable del Tratamiento</h2>
<p>Digit2AI [razón social, NIT, domicilio en Colombia]. Canal de atención en protección de datos: [privacidad@equimind.app].</p>

<h2>2. Qué datos tratamos</h2>
<ul>
<li><strong>Datos de cuenta:</strong> correo electrónico, nombre visible y una contraseña almacenada de forma cifrada (hash).</li>
<li><strong>Datos de pago:</strong> procesados por nuestro proveedor de pagos (Stripe). <strong>No</strong> almacenamos el número completo de la tarjeta; conservamos únicamente referencias de la transacción, montos y estado.</li>
<li><strong>Contenido cargado:</strong> el audio, video o imágenes que usted envía, junto con los datos del caballo (nombre, sexo, capa, criadero) y las métricas de marcha derivadas de sus cargas.</li>
<li><strong>Datos técnicos:</strong> dirección IP (para seguridad y control de tasa), una cookie de autenticación (<code>ecpf_token</code>) y registros del servidor (logs).</li>
</ul>

<h2>3. Finalidades</h2>
<p>Crear y asegurar su cuenta; ejecutar los análisis de marcha que usted solicita; procesar pagos y créditos; generar y, si usted lo decide, compartir reportes; brindar soporte; garantizar la seguridad y prevenir abusos; y cumplir obligaciones legales.</p>

<h2>4. Base legal / autorización</h2>
<p>Tratamos sus datos con fundamento en su autorización (otorgada al registrarse y usar el Servicio) y para ejecutar la relación contractual entre las partes. Usted puede revocar su autorización en cualquier momento, sujeto a los deberes legales o contractuales de conservación.</p>

<h2>5. Encargados y terceros</h2>
<p>Compartimos datos únicamente con proveedores que nos ayudan a operar el Servicio bajo deberes de confidencialidad — en particular <strong>Stripe</strong> (pagos) y nuestro proveedor de alojamiento en la nube (<strong>Render</strong>). No vendemos sus datos personales.</p>

<h2>6. Transferencias internacionales</h2>
<p>Nuestros proveedores pueden almacenar o procesar datos en servidores ubicados fuera de Colombia. Adoptamos medidas razonables para asegurar un nivel de protección adecuado y conforme con la ley colombiana.</p>

<h2>7. Conservación</h2>
<p>Conservamos los datos de cuenta y de análisis mientras su cuenta esté activa y, posteriormente, solo por el tiempo requerido para atender obligaciones legales, contables o de resolución de controversias, tras lo cual se eliminan o anonimizan. El video <strong>no</strong> se almacena en nuestros servidores; el audio se analiza y lo que conservamos son las métricas resultantes (no el archivo original), junto con un conjunto limitado de puntos de referencia de pose para trazabilidad.</p>

<h2>8. Derechos del Titular</h2>
<p>Usted tiene derecho a conocer, actualizar y rectificar sus datos; solicitar prueba de la autorización otorgada; ser informado sobre el uso de sus datos; presentar quejas ante la Superintendencia de Industria y Comercio (SIC); acceder gratuitamente a sus datos; y revocar la autorización o solicitar la supresión cuando no exista un deber legal de conservarlos. Para ejercer estos derechos, escriba a [privacidad@equimind.app]. Atendemos consultas dentro de 10 días hábiles y reclamos dentro de 15 días hábiles (prorrogables según la ley).</p>

<h2>9. Seguridad</h2>
<p>Aplicamos medidas técnicas y administrativas razonables: cifrado de contraseñas (hash), HTTPS, cookies de autenticación HttpOnly/Secure, control de tasa y controles de acceso. Ningún sistema es completamente seguro, pero trabajamos para proteger su información.</p>

<h2>10. Cookies</h2>
<p>Usamos una cookie de autenticación estrictamente necesaria (<code>ecpf_token</code>) para mantener su sesión iniciada. No se usa con fines publicitarios.</p>

<h2>11. Menores de edad</h2>
<p>El Servicio no está dirigido a niños, niñas ni adolescentes. No tratamos conscientemente datos de menores sin la autorización correspondiente.</p>

<h2>12. Cambios</h2>
<p>Podemos actualizar esta política; la versión vigente se publica siempre aquí con su fecha.</p>

<p><a href="${esc(base)}">&larr; Volver</a> · <a href="${esc(base)}terminos">Términos</a> · <a href="${esc(base)}reembolsos">Reembolsos</a></p>
`;
  res.set('Content-Type', 'text/html; charset=utf-8')
     .send(legalShell(lang, lang === 'en' ? 'Privacy Policy' : 'Política de Privacidad', d.title, body));
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
<p><em>Last updated: July 4, 2026. This English-language version applies to users in the United States and is governed by U.S. law as set out below.</em></p>
<p><strong>PLEASE READ SECTION 14 (ARBITRATION &amp; CLASS-ACTION WAIVER) CAREFULLY — IT AFFECTS HOW DISPUTES ARE RESOLVED.</strong></p>

<h2>1. Who we are &amp; acceptance</h2>
<p>EquiMind ("the Service", "we", "us") is operated by Digit2AI [legal entity, U.S. state of formation, address]. By creating an account, purchasing credits, or using the Service, you electronically agree to these Terms in full. If you do not agree, do not use the Service.</p>

<h2>2. What the Service is — and is not</h2>
<p>EquiMind is an <strong>informational and educational software tool</strong> that estimates the gait and characteristics of Paso Fino horses from audio and/or video you upload, using automated algorithms and AI.</p>
<p><strong>The Service is NOT, and must never be relied upon as:</strong> (a) an official or sanctioned competition result or judging authority; (b) veterinary, medical, or health advice or diagnosis; (c) a certification of a horse's value, breeding suitability, soundness, or fitness; (d) a basis for any purchase, sale, breeding, wagering, insurance, or medical decision. All results are automated <strong>estimates</strong> and may be inaccurate or incomplete.</p>

<h2>3. No warranty of accuracy</h2>
<p>Results depend on recording quality, surface, equipment, and factors outside our control. We do not warrant that any result is accurate, reliable, reproducible, or fit for any purpose. You are solely responsible for how you interpret and use any result. Always consult a licensed veterinarian and/or a certified judge for any decision that matters.</p>

<h2>4. Eligibility &amp; accounts</h2>
<p>The Service is intended for users who are at least 18 years old and located in the United States. You are responsible for the confidentiality of your credentials and for all activity under your account. Provide accurate information and keep it current.</p>

<h2>5. Credits &amp; payment</h2>
<p>Paid features run on credits purchased through our payment processor (Stripe). Prices are shown before purchase and may change prospectively. <strong>A credit is consumed only when a real analysis is performed</strong> (real uploaded audio/video with a detectable signal). When no usable real signal is present, the Service returns a free reference simulation and no credit is charged. Credits have no cash value except as required by law and are non-transferable outside your linked EquiMind account family. You authorize us and Stripe to charge your selected payment method for your purchases.</p>

<h2>6. Refunds</h2>
<p>Refunds are governed by our <a href="${esc(base)}reembolsos">Refund Policy</a>, incorporated into these Terms by reference.</p>

<h2>7. Your content &amp; acceptable use</h2>
<p>You represent that you own or have the rights to any audio, video, images, and horse information you upload, and that your use does not involve animal cruelty, illegal activity, or the infringement of any third party's rights. You grant us a limited, worldwide, royalty-free license to host and process your uploads solely to provide the Service. You must not misuse, reverse-engineer, overload, scrape, or resell the Service.</p>

<h2>8. Copyright / DMCA</h2>
<p>We respond to notices of alleged copyright infringement under the Digital Millennium Copyright Act (17 U.S.C. §512). If you believe content on the Service infringes your copyright, send a compliant notice to our designated agent at [dmca@equimind.app]. We may remove content and terminate repeat infringers.</p>

<h2>9. Shared/public reports</h2>
<p>If you generate a public share link for a report, you accept that anyone with the link can view that report. You choose whether to share; we are not responsible for further distribution by you or recipients.</p>

<h2>10. Intellectual property</h2>
<p>The Service, its software, models, scoring logic, branding, and design are owned by Digit2AI and protected by U.S. and international law. These Terms grant you a personal, non-exclusive, non-transferable, revocable license to use the Service; no other rights are granted.</p>

<h2>11. Assumption of risk &amp; indemnification</h2>
<p>Activities involving horses are inherently dangerous. You assume all risk arising from your equine activities. You agree to indemnify, defend, and hold harmless Digit2AI, its owners, staff, and providers from any claim, loss, liability, or expense (including reasonable attorneys' fees) arising out of your use of the Service, your uploads, or your reliance on any result.</p>

<h2>12. "AS IS" — disclaimer of warranties</h2>
<p>To the maximum extent permitted by law, the Service is provided <strong>"AS IS" and "AS AVAILABLE"</strong>, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, accuracy, title, and non-infringement. We do not warrant uninterrupted or error-free operation. <strong>Some states do not allow the exclusion of certain implied warranties, so some of the above may not apply to you.</strong></p>

<h2>13. Limitation of liability</h2>
<p>To the maximum extent permitted by law, Digit2AI and its providers shall not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, data, goodwill, animals, or opportunities, arising from the Service, under any theory of liability. Our total aggregate liability for any and all claims shall not exceed the greater of (a) the amount you paid us in the three (3) months before the event giving rise to the claim, or (b) USD 50. <strong>Some states do not allow the exclusion or limitation of incidental or consequential damages, so the above may not apply to you.</strong></p>

<h2>14. Binding arbitration &amp; class-action waiver</h2>
<p>Please read this section carefully. You and Digit2AI agree that any dispute, claim, or controversy arising out of or relating to the Service or these Terms will be resolved by <strong>binding individual arbitration</strong> administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules, and not in court, except that either party may bring an individual claim in small-claims court. The Federal Arbitration Act governs the interpretation and enforcement of this section.</p>
<p><strong>Class-action waiver:</strong> disputes will be arbitrated only on an individual basis; you and we waive any right to participate in a class, collective, or representative action.</p>
<p><strong>30-day opt-out:</strong> you may opt out of this arbitration agreement by emailing [legal@equimind.app] within 30 days of first accepting these Terms, stating your name and intent to opt out. Opting out does not affect the other provisions.</p>

<h2>15. Governing law &amp; venue</h2>
<p>These Terms are governed by the laws of the State of [STATE], USA, and applicable U.S. federal law, without regard to conflict-of-laws rules. For any matter not subject to arbitration, the state and federal courts located in [COUNTY, STATE] shall have exclusive jurisdiction, and you consent to that venue. Nothing in these Terms waives any non-waivable consumer right under the law of your state of residence.</p>

<h2>16. Electronic communications</h2>
<p>You consent to receive communications from us electronically (email and in-app notices), and you agree that electronic agreements, notices, and records satisfy any legal requirement that such communications be in writing (E-SIGN Act).</p>

<h2>17. Changes, suspension &amp; termination</h2>
<p>We may modify the Service or these Terms at any time; material changes take effect when posted here, and your continued use constitutes acceptance. We may suspend or terminate accounts that violate these Terms. You may stop using the Service at any time.</p>

<h2>18. General</h2>
<p>If any provision is held unenforceable, the rest remains in effect. These Terms are the entire agreement between you and us regarding the Service and supersede prior agreements.</p>

<h2>19. Contact</h2>
<p>[support@equimind.app] · Digit2AI · [address].</p>
<p><a href="${esc(base)}">&larr; Back</a> · <a href="${esc(base)}reembolsos">Refund Policy</a> · <a href="${esc(base)}privacidad">Privacy</a></p>
` : `
<h1>Términos de Servicio</h1>
<p><em>Última actualización: ${updated}. Esta versión en español aplica a los usuarios en Colombia y se rige por la ley colombiana. Los usuarios en Estados Unidos deben consultar la <a href="${esc(base)}terminos?lang=en">versión en inglés</a>, regida por la ley estadounidense.</em></p>

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
<p><em>Last updated: July 4, 2026. This English-language policy applies to users in the United States and forms part of our <a href="${esc(base)}terminos">Terms of Service</a>.</em></p>

<h2>1. Digital nature of the product</h2>
<p>Credits and the analyses they unlock are <strong>digital products delivered instantly</strong>. As a general rule, once a credit has been consumed to produce a result, that purchase is <strong>final and non-refundable</strong>, because the service has been fully rendered. By purchasing, you consent to immediate delivery of digital goods.</p>

<h2>2. You only pay for real analyses</h2>
<p>A credit is charged <strong>only when a real analysis runs</strong> (real audio/video with a detectable signal). If there is no usable signal, EquiMind returns a <strong>free reference simulation</strong> and no credit is charged. This design minimizes billing disputes.</p>

<h2>3. When we DO issue a refund</h2>
<ul>
<li><strong>Verifiable technical failure:</strong> a credit was charged but, due to a fault on our side, no result was delivered. We will restore the credit or refund it at our discretion.</li>
<li><strong>Duplicate or erroneous charge</strong> by the payment processor.</li>
<li>Any case where a refund is required by applicable federal or state law.</li>
</ul>

<h2>4. Unused credits</h2>
<p>Unused credit balances may be refunded within <strong>fourteen (14) days</strong> of purchase, provided none of the credits in that purchase have been consumed. After 14 days, or once any credit from the purchase has been used, unused credits are non-refundable but remain available in your account.</p>

<h2>5. No general cooling-off period for online digital goods</h2>
<p>U.S. federal and state "cooling-off" rules generally apply to certain in-person or door-to-door sales and do <strong>not</strong> apply to online digital content that has been accessed or consumed. Except as stated in this policy or required by law, all sales of consumed credits are final. This policy is disclosed to you before purchase, as required by applicable state law (including, for California residents, Cal. Civ. Code §1723).</p>

<h2>6. How to request a refund</h2>
<p>Email [support@equimind.app] within the applicable window with your account email, the date, and the transaction/receipt reference. We aim to respond within 10 business days. Approved refunds are returned to the original payment method via Stripe.</p>

<h2>7. Chargebacks</h2>
<p>Please contact us before opening a chargeback so we can resolve the issue directly and quickly.</p>

<p><a href="${esc(base)}">&larr; Back</a> · <a href="${esc(base)}terminos">Terms of Service</a> · <a href="${esc(base)}privacidad">Privacy</a></p>
` : `
<h1>Política de Reembolso</h1>
<p><em>Última actualización: ${updated}. Esta versión en español aplica a los usuarios en Colombia. Los usuarios en Estados Unidos deben consultar la <a href="${esc(base)}reembolsos?lang=en">versión en inglés</a>.</em></p>

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
